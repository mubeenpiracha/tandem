module.exports = {
  $randomString,
  $timestamp,
  $randomWorkspaceId,
  workspace_id: 'test-workspace-' + Math.random().toString(36).substr(2, 9)
};

function $randomString() {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
}

function $timestamp() {
  return Math.floor(Date.now() / 1000);
}

function $randomWorkspaceId() {
  const workspaces = [
    'workspace-alpha',
    'workspace-beta', 
    'workspace-gamma',
    'workspace-delta'
  ];
  return workspaces[Math.floor(Math.random() * workspaces.length)];
}