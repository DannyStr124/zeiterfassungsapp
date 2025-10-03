import { defineConfig } from 'vite';

const desiredPort = 5173;
export default defineConfig({
  server: {
    port: desiredPort,
    strictPort: false, // allow fallback if busy
    hmr: {
      clientPort: desiredPort,
      protocol: 'ws',
      host: 'localhost'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  plugins: [
    {
      name:'log-final-port',
      configureServer(server){
        server.httpServer?.once('listening', ()=>{
          const addr=server.httpServer.address();
          // eslint-disable-next-line no-console
          console.log('[Vite] Dev server listening on', addr);
        });
      }
    }
  ]
});
