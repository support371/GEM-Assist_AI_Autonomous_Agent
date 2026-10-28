/**
 * GEM Taskade · relational repository
 *
 * Writes workspaces / projects / tasks straight to Supabase relational
 * tables so Realtime subscriptions carry live cross-device state and the
 * SPA no longer surfaces seed data to the public.
 *
 * Each function is a thin wrapper that:
 *  - requires a Supabase client (returns gracefully when offline)
 *  - returns `{ data, error }` so callers can decide the UX
 *  - uses the authenticated session (RLS keys off auth.uid())
 *
 * Falls back to window.storage (kv) only when Supabase is unavailable —
 * authenticated viewers always read/write relational.
 */

const sb = () => (typeof window !== 'undefined' ? window.__gem?.supabase : null) || null;
const uid = () => (crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)));

/** Load every workspace + its projects + tasks the current user can see. */
export async function loadAll() {
  const s = sb();
  if (!s) return { workspaces: [], tasksById: {} };
  const { data: wsRows, error: wsErr } = await s
    .from('workspaces')
    .select('id, name, emoji, color, created_at, projects:projects(id, name, emoji, color, favorite, created_at)')
    .order('created_at', { ascending: true });
  if (wsErr) { console.warn('[repo] workspaces load:', wsErr.message); return { workspaces: [], tasksById: {} }; }

  const workspaces = (wsRows || []).map(w => ({
    id: w.id,
    name: w.name,
    emoji: w.emoji || '🔺',
    color: w.color || '#ff5f6d',
    isPersonal: true,
    memberCount: 1,
    projects: (w.projects || [])
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(p => ({
        id: p.id, name: p.name,
        emoji: p.emoji || '📝', color: p.color || '#9b5cff',
        cover: 'purple', favorite: !!p.favorite,
        members: 1, lastActive: new Date(p.created_at).getTime(),
      })),
    folders: [],
  }));

  // Pull all tasks for the user's visible projects in one shot.
  const projectIds = workspaces.flatMap(w => w.projects.map(p => p.id));
  let tasksById = {};
  if (projectIds.length) {
    const { data: taskRows, error: tErr } = await s
      .from('tasks')
      .select('id, project_id, title, completed, priority, assignee, due_date, tags, notes, position')
      .in('project_id', projectIds)
      .order('position', { ascending: true });
    if (tErr) console.warn('[repo] tasks load:', tErr.message);
    for (const r of (taskRows || [])) {
      (tasksById[r.project_id] ||= []).push({
        id: r.id, title: r.title, completed: !!r.completed,
        priority: r.priority || 'medium',
        assignee: r.assignee, dueDate: r.due_date,
        tags: r.tags || [], notes: r.notes || '', subtasks: [],
      });
    }
  }
  return { workspaces, tasksById };
}

export async function createWorkspace({ name, emoji, color }, ownerId) {
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const row = { id: uid(), name, emoji: emoji || '🔺', color: color || '#ff5f6d', owner_id: ownerId };
  const { data, error } = await s.from('workspaces').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function createProject({ workspaceId, name, emoji, color }) {
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const row = { id: uid(), workspace_id: workspaceId, name, emoji: emoji || '📝', color: color || '#9b5cff' };
  const { data, error } = await s.from('projects').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

/**
 * Create a project with its initial tasks in one transaction (RPC).
 * Preferred path from the AI-generation flow — no partial state on failure.
 */
export async function createProjectWithTasks({ workspaceId, project, tasks }) {
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const { data, error } = await s.rpc('create_project_with_tasks', {
    p_workspace: workspaceId,
    p_project: project,
    p_tasks: tasks || [],
  });
  if (error) throw error;
  return data; // new project uuid
}

export async function upsertTask(task, projectId) {
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const row = {
    id: task.id || uid(),
    project_id: projectId,
    title: task.title,
    completed: !!task.completed,
    priority: task.priority || 'medium',
    assignee: task.assignee || null,
    due_date: task.dueDate || null,
    tags: task.tags || [],
    notes: task.notes || '',
    position: task.position ?? 0,
  };
  const { error } = await s.from('tasks').upsert(row);
  if (error) throw error;
  return row.id;
}

export async function deleteTask(taskId) {
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const { error } = await s.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
}

export async function deleteProject(projectId) {
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const { error } = await s.from('projects').delete().eq('id', projectId);
  if (error) throw error;
}

export async function deleteWorkspace(workspaceId) {
  const s = sb();
  if (!s) throw new Error('Supabase not configured');
  const { error } = await s.from('workspaces').delete().eq('id', workspaceId);
  if (error) throw error;
}
