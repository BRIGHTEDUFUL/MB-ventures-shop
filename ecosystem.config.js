/**
 * PM2 Ecosystem Configuration for MB Ventures GH
 * 
 * This file configures PM2 (process manager) for production deployment
 * on Hostinger or any Node.js hosting environment.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 */

module.exports = {
  apps: [{
    // Application name (used in PM2 commands)
    name: 'mbventuresghana',
    
    // Entry point (built by `npm run build`)
    script: '.output/server/index.mjs',
    
    // Number of instances
    // 'max' = use all CPU cores (cluster mode)
    // or set to specific number: 2, 4, etc.
    instances: 'max',
    
    // Execution mode
    // 'cluster' = load-balance across instances
    // 'fork' = single instance
    exec_mode: 'cluster',
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '0.0.0.0'
    },
    
    // Logging
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    
    // Memory management
    // Restart if memory exceeds 500MB
    max_memory_restart: '500M',
    
    // Restart strategies
    // Restart if app crashes
    autorestart: true,
    
    // Number of restart attempts
    max_restarts: 10,
    
    // Minimum uptime before considering stable
    min_uptime: '10s',
    
    // Exponential backoff restart delay
    exp_backoff_restart_delay: 100,
    
    // Watch for file changes (disable in production)
    watch: false,
    
    // Graceful shutdown
    kill_timeout: 5000,
    
    // Wait time between cluster restarts
    wait_ready: true,
    listen_timeout: 10000,
    
    // Additional options
    merge_logs: true,
    combine_logs: true,
    
    // Instance variables (available in app via process.env)
    instance_var: 'INSTANCE_ID',
    
    // Cron restart (optional - restart daily at 3 AM)
    // cron_restart: '0 3 * * *',
    
    // Post-deploy hooks (optional)
    // post_update: ['npm install', 'npm run build']
  }],
  
  // Deployment configuration (optional - for PM2 deploy)
  deploy: {
    production: {
      // SSH connection
      user: 'root',
      host: 'YOUR_VPS_IP',
      ref: 'origin/main',
      repo: 'https://github.com/BRIGHTEDUFUL/MB-ventures-shop.git',
      path: '/var/www/mbventuresghana',
      
      // Commands to run on server
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      
      // Environment variables for deployment
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
