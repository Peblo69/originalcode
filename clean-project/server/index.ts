const tryBind = async (retries = 5, delay = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (server) {
        await new Promise<void>(resolve => server?.close(resolve));
      }

      server = registerRoutes(app);

      await new Promise<void>((resolve, reject) => {
        server?.once('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`Attempt ${attempt}/${retries}: Port ${INTERNAL_PORT} in use, retrying in ${delay/1000} seconds...`);
          } else {
            reject(err);
          }
        });

        server?.listen(INTERNAL_PORT, '0.0.0.0', () => {
          console.log('\n🚀 Server Status:');
          console.log(`📡 Internal: Running on 0.0.0.0:${INTERNAL_PORT}`);
          console.log(`🌍 External: Mapped to port 3000`);
          console.log(`⏰ Started at: ${new Date().toISOString()}\n`);
          console.log('✅ Server is ready to accept connections\n');
          resolve();
        });
      });

      return; // Success
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

const INTERNAL_PORT = process.env.PORT || 5000;
let server: http.Server | null = null;