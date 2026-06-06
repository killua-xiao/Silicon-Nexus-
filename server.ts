import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import fs from 'fs';

// --- CONFIG & LIMITS ---
const MAX_TASKS = 5000;
const MAX_AGENTS = 1000;
const MAX_LOGS = 100;

// --- IN-MEMORY DATABASE FOR AGENTS with Local Storage Backing ---
interface AgentMemory {
  [key: string]: any;
}

interface Task {
  id: string;
  creatorId: string;
  type: string;
  payload: any;
  status: 'open' | 'processing' | 'completed' | 'failed';
  assignedTo?: string;
  result?: any;
  createdAt: string;
  updatedAt: string;
}

let memoryStore: Record<string, AgentMemory> = {};
let taskQueue: Task[] = [];
const eventLogs: any[] = [];

// Ensure persistence directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

// Helper to load state from disk
function loadPreservedState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const contents = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(contents);
      memoryStore = data.memoryStore || {};
      taskQueue = data.taskQueue || [];
      console.log(`[Silicon Nexus] Loaded ${Object.keys(memoryStore).length} agents and ${taskQueue.length} tasks from ${DATA_FILE}`);
    }
  } catch (error) {
    console.error("[Silicon Nexus] Error reading persistent store, starting with empty registers:", error);
  }
}

// Helper to save state cleanly
let saveTimeout: NodeJS.Timeout | null = null;
function persistState() {
  // Coalesce / debounce disk writes to prevent I/O load
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const stateToSave = {
        memoryStore,
        taskQueue: taskQueue.slice(-2000), // Only save last 2000 tasks to prevent bloating
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(stateToSave, null, 2), 'utf-8');
    } catch (error) {
      console.error("[Silicon Nexus] Failed to save persistent store to flat file:", error);
    }
  }, 1000); // Wait 1 second after last mutation
}

function logEvent(type: string, agentId: string, details: string) {
  const event = {
    id: Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString(),
    type,
    agentId,
    details
  };
  eventLogs.unshift(event);
  if (eventLogs.length > MAX_LOGS) eventLogs.pop();
}

// --- VALIDATION SCHEMAS ---
const idSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_\-]+$/);
const memoryKeySchema = z.string().min(1).max(100);
const memoryDataSchema = z.record(memoryKeySchema, z.any()).refine(
  data => JSON.stringify(data).length <= 50000, 
  "Memory payload too large (max ~50KB)"
);

const createTaskSchema = z.object({
  creatorId: idSchema,
  type: z.string().min(1).max(100),
  payload: z.any().refine(p => JSON.stringify(p).length <= 50000, "Payload too large"),
});

const acceptTaskSchema = z.object({
  agentId: idSchema,
});

const completeTaskSchema = z.object({
  agentId: idSchema,
  status: z.enum(['completed', 'failed']).optional().default('completed'),
  result: z.any().refine(p => JSON.stringify(p).length <= 100000, "Result payload too large"),
});

async function startServer() {
  // Load persistent database data
  loadPreservedState();

  const app = express();
  const PORT = 3000;

  // Trust proxy is required when running behind a reverse proxy (like Cloud Run or standard load balancers)
  // This resolves express-rate-limit 'X-Forwarded-For' and 'Forwarded' header warnings and ensures correct IP tracking
  app.set('trust proxy', 1);

  // --- MIDDLEWARE ---
  // Security headers. Disable contentSecurityPolicy for development to allow local script execution if needed, but strict elsewhere.
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled for preview environment compatibility
    crossOriginEmbedderPolicy: false
  }));
  app.use(cors());
  app.use(express.json({ limit: '500kb' })); // Limit body payload size

  // Global API Rate Limiter to prevent DoS attacks from runaway agent scripts
  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 600, // Limit each IP to 600 requests per `window` (per minute)
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply to /api routes
  app.use('/api', apiLimiter);

  // --- SECURITY KEY AUTHORIZATION MIDDLEWARE (Private Mode) ---
  // If NEXUS_API_KEY is configured as an environment variable, require correct header key
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const systemKey = process.env.NEXUS_API_KEY || process.env.API_KEY;
    if (!systemKey) {
      // API Key is not set on the server, open access is allowed
      return next();
    }

    // Checking of auth status endpoint is always open
    if (req.path === '/api/auth/status') {
      return next();
    }

    // Verify header credentials
    const authHeader = req.headers['authorization'];
    const customHeader = req.headers['x-api-key'];
    let providedKey = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      providedKey = authHeader.substring(7);
    } else if (customHeader) {
      providedKey = String(customHeader);
    } else if (req.query.api_key) {
      providedKey = String(req.query.api_key);
    }

    if (providedKey === systemKey) {
      return next();
    }

    res.status(401).json({
      error: 'Unauthorized Access',
      message: 'This Silicon Nexus is a private personal workspace. Please provide a valid NEXUS_API_KEY/API_KEY.',
      code: 'NEXUS_RE_AUTHENTICATE'
    });
  };

  // Mount Auth Checks globally under /api
  app.use('/api', authMiddleware);

  // Auth Status check endpoint
  app.get('/api/auth/status', (req, res) => {
    const isProtected = !!(process.env.NEXUS_API_KEY || process.env.API_KEY);
    res.json({ protected: isProtected });
  });

  // --- API FOR UI DASHBOARD ---
  // We keep this lightweight as the dashboard polls it
  app.get('/api/dashboard/system-info', (req, res) => {
    res.json({
      activeAgents: Object.keys(memoryStore).length,
      totalTasks: taskQueue.length,
      completedTasks: taskQueue.filter(t => t.status === 'completed' || t.status === 'failed').length,
    });
  });

  app.get('/api/dashboard/activity-logs', (req, res) => {
    res.json(eventLogs);
  });

  app.get('/api/dashboard/task-queue', (req, res) => {
    // Return last 100 tasks to dashboard to prevent large payload
    res.json(taskQueue.slice(-100));
  });
  
  app.get('/api/dashboard/memory-vault', (req, res) => {
    res.json(memoryStore);
  });

  // --- NATIVE APIs FOR SILICON LIFEFORMS (AGENTS) ---

  // 1. MEMORY VAULT
  app.post('/api/agent/:agentId/memory', (req, res) => {
    try {
      const agentId = idSchema.parse(req.params.agentId);
      const data = memoryDataSchema.parse(req.body);
      
      // Auto-prune old agents if memory bounds exceeded
      if (!memoryStore[agentId] && Object.keys(memoryStore).length >= MAX_AGENTS) {
        return res.status(429).json({ error: 'Maximum agent capacity reached in memory vault.' });
      }

      if (!memoryStore[agentId]) {
        memoryStore[agentId] = {};
        logEvent('AGENT_REGISTERED', agentId, 'New silicon entity detected.');
      }
      
      // Merge
      memoryStore[agentId] = { ...memoryStore[agentId], ...data };
      logEvent('MEMORY_WRITE', agentId, `Wrote keys: ${Object.keys(data).join(', ')}`);
      
      // Trigger disk save
      persistState();

      res.json({ status: 'success', storedKeys: Object.keys(data) });
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed', details: err.errors || err.message });
    }
  });

  app.get('/api/agent/:agentId/memory/:key?', (req, res) => {
    try {
      const agentId = idSchema.parse(req.params.agentId);
      const key = req.params.key ? memoryKeySchema.parse(req.params.key) : undefined;
      
      const memory = memoryStore[agentId] || {};
      
      if (key) {
        logEvent('MEMORY_READ', agentId, `Accessed key: ${key}`);
        res.json({ [key]: memory[key] || null });
      } else {
        logEvent('MEMORY_READ', agentId, `Accessed full memory dump.`);
        res.json(memory);
      }
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed', details: err.errors || err.message });
    }
  });

  // 2. TASK DELEGATION
  app.post('/api/tasks', (req, res) => {
    try {
      const { creatorId, type, payload } = createTaskSchema.parse(req.body);

      // Memory management for task queue
      if (taskQueue.length >= MAX_TASKS) {
        // Remove 1000 oldest completed/failed tasks, or just oldest if all are open
        const completedIndexes = taskQueue
          .map((t, i) => (t.status === 'completed' || t.status === 'failed' ? i : -1))
          .filter(i => i !== -1);
          
        if (completedIndexes.length > 0) {
          // Remove up to 500 oldest completed ones to free space
          const toRemove = new Set(completedIndexes.slice(0, 500));
          taskQueue = taskQueue.filter((_, i) => !toRemove.has(i));
        } else {
          // If no completed, remove oldest
          taskQueue.splice(0, 500); 
        }
      }

      const newTask: Task = {
        id: `task_${Date.now()}_${Math.random().toString(36).substring(5)}`,
        creatorId,
        type,
        payload,
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      taskQueue.push(newTask);
      logEvent('TASK_CREATED', creatorId, `Posted task type: ${type}`);
      
      // Trigger disk save
      persistState();

      res.json({ status: 'created', taskId: newTask.id });
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed', details: err.errors || err.message });
    }
  });

  // Agents poll this to find work
  app.get('/api/tasks/open', (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      if (type) memoryKeySchema.parse(type); // basic str validation

      let openTasks = taskQueue.filter(t => t.status === 'open');
      if (type) {
        openTasks = openTasks.filter(t => t.type === type);
      }
      
      // Limit returned tasks to save bandwidth 
      res.json(openTasks.slice(0, 50));
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed' });
    }
  });

  // Agent accepts a task
  app.post('/api/tasks/:taskId/accept', (req, res) => {
    try {
      const taskId = idSchema.parse(req.params.taskId);
      const { agentId } = acceptTaskSchema.parse(req.body);
      
      const task = taskQueue.find(t => t.id === taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.status !== 'open') return res.status(400).json({ error: 'Task is no longer open' });

      task.status = 'processing';
      task.assignedTo = agentId;
      task.updatedAt = new Date().toISOString();

      logEvent('TASK_ACQUIRED', agentId, `Processing task: ${taskId}`);
      
      // Trigger disk save
      persistState();

      res.json({ status: 'assigned', task });
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed', details: err.errors || err.message });
    }
  });

  // Agent completes a task
  app.post('/api/tasks/:taskId/complete', (req, res) => {
    try {
      const taskId = idSchema.parse(req.params.taskId);
      const { agentId, result, status } = completeTaskSchema.parse(req.body);

      const task = taskQueue.find(t => t.id === taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.assignedTo !== agentId) return res.status(403).json({ error: 'Task not assigned to you' });

      task.status = status;
      task.result = result;
      task.updatedAt = new Date().toISOString();

      logEvent(`TASK_${status.toUpperCase()}`, agentId, `Finished task: ${taskId}`);
      
      // Trigger disk save
      persistState();

      res.json({ status: 'updated', task });
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed', details: err.errors || err.message });
    }
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  // --- VITE MIDDLEWARE FOR DEVELOPMENT & PRODUCTION SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve built static files
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Silicon Nexus] Core online. Listening on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server", err);
});
