module.exports = {
  setupWorkspaces,
  testWorkspaceAccess,
  setupTwoWorkspaces,
  attemptCrossWorkspaceAccess,
  workspaceAOperations,
  workspaceBOperations,
  workspaceCOperations
};

const workspaces = [
  'ws-test-1',
  'ws-test-2', 
  'ws-test-3',
  'ws-test-4'
];

async function setupWorkspaces(context, events, done) {
  context.vars.workspaceTokens = {};
  
  for (const workspace of workspaces) {
    try {
      const response = await context.http.post('/api/auth/test-login', {
        json: { workspace_id: workspace }
      });
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        context.vars.workspaceTokens[workspace] = data.token;
      }
    } catch (error) {
      console.error(`Failed to setup workspace ${workspace}:`, error);
    }
  }
  
  done();
}

async function testWorkspaceAccess(context, events, done) {
  const workspace = workspaces[Math.floor(Math.random() * workspaces.length)];
  const token = context.vars.workspaceTokens[workspace];
  
  if (!token) {
    done();
    return;
  }
  
  try {
    // Test accessing tasks in the workspace
    const response = await context.http.get('/api/tasks', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Workspace-ID': workspace
      }
    });
    
    events.emit('counter', 'workspace_access_attempts', 1);
    
    if (response.statusCode === 200) {
      events.emit('counter', 'workspace_access_success', 1);
    } else {
      events.emit('counter', 'workspace_access_failed', 1);
    }
  } catch (error) {
    events.emit('counter', 'workspace_access_error', 1);
  }
  
  done();
}

async function setupTwoWorkspaces(context, events, done) {
  context.vars.workspaceA = 'ws-test-isolation-a';
  context.vars.workspaceB = 'ws-test-isolation-b';
  
  try {
    // Setup workspace A
    const responseA = await context.http.post('/api/auth/test-login', {
      json: { workspace_id: context.vars.workspaceA }
    });
    
    if (responseA.statusCode === 200) {
      const dataA = JSON.parse(responseA.body);
      context.vars.tokenA = dataA.token;
    }
    
    // Setup workspace B  
    const responseB = await context.http.post('/api/auth/test-login', {
      json: { workspace_id: context.vars.workspaceB }
    });
    
    if (responseB.statusCode === 200) {
      const dataB = JSON.parse(responseB.body);
      context.vars.tokenB = dataB.token;
    }
  } catch (error) {
    console.error('Failed to setup workspaces for isolation test:', error);
  }
  
  done();
}

async function attemptCrossWorkspaceAccess(context, events, done) {
  if (!context.vars.tokenA || !context.vars.tokenB) {
    done();
    return;
  }
  
  try {
    // Try to use workspace A token to access workspace B resources
    const response = await context.http.get('/api/tasks', {
      headers: {
        'Authorization': `Bearer ${context.vars.tokenA}`,
        'X-Workspace-ID': context.vars.workspaceB  // Wrong workspace!
      }
    });
    
    events.emit('counter', 'cross_workspace_attempts', 1);
    
    // This should fail with 403 Forbidden
    if (response.statusCode === 403) {
      events.emit('counter', 'workspace_isolation_success', 1);
    } else {
      events.emit('counter', 'workspace_isolation_violation', 1);
    }
  } catch (error) {
    events.emit('counter', 'cross_workspace_error', 1);
  }
  
  done();
}

async function workspaceAOperations(context, events, done) {
  await performWorkspaceOperations(context, events, 'workspace-perf-a', 'a');
  done();
}

async function workspaceBOperations(context, events, done) {
  await performWorkspaceOperations(context, events, 'workspace-perf-b', 'b');
  done();
}

async function workspaceCOperations(context, events, done) {
  await performWorkspaceOperations(context, events, 'workspace-perf-c', 'c');
  done();
}

async function performWorkspaceOperations(context, events, workspaceId, suffix) {
  try {
    // Get auth token
    const authResponse = await context.http.post('/api/auth/test-login', {
      json: { workspace_id: workspaceId }
    });
    
    if (authResponse.statusCode !== 200) {
      return;
    }
    
    const authData = JSON.parse(authResponse.body);
    const token = authData.token;
    
    // Create a task
    const createResponse = await context.http.post('/api/tasks', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Workspace-ID': workspaceId
      },
      json: {
        title: `Performance test task ${suffix} ${Date.now()}`,
        description: 'Created during multi-workspace performance test',
        estimatedDuration: 30
      }
    });
    
    events.emit('counter', `workspace_${suffix}_task_created`, 1);
    
    // List tasks
    const listResponse = await context.http.get('/api/tasks', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Workspace-ID': workspaceId
      }
    });
    
    events.emit('counter', `workspace_${suffix}_tasks_listed`, 1);
    
    // Check workspace health
    const healthResponse = await context.http.get(`/health/${workspaceId}`);
    events.emit('counter', `workspace_${suffix}_health_checked`, 1);
    
  } catch (error) {
    events.emit('counter', `workspace_${suffix}_operation_error`, 1);
  }
}