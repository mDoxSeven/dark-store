module.exports = {
  apps: [{
    name: 'dark-store',
    cwd: __dirname,
    script: 'dist/main.js',
    instances: 1,
    exec_mode: 'fork',
    node_args: '--max-old-space-size=192',
    max_memory_restart: '240M',
    restart_delay: 5000,
    min_uptime: '20s',
    max_restarts: 10,
    kill_timeout: 10000,
    time: true,
    env: { NODE_ENV: 'production' }
  }]
};
