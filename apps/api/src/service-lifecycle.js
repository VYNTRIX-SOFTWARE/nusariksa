/**
 * Graceful shutdown: stop taking requests, drain current HTTP connections,
 * then close the PostgreSQL pool. Repeated signals share one shutdown.
 * A bounded drain avoids a hung request blocking service replacement forever.
 */
export function createServiceShutdown({server,pool,drainMs=10000}={}){
  if(!server||typeof server.close!=='function'
    ||!Number.isSafeInteger(drainMs)||drainMs<1||drainMs>60000)
    throw new TypeError('Invalid service shutdown configuration');
  let pending=null;
  return function shutdown(){
    if(pending)return pending;
    pending=(async()=>{
      const deadline=setTimeout(()=>{server.closeAllConnections?.();},drainMs);
      try{
        await new Promise((resolve,reject)=>{
          try{
            server.close(error=>{
              if(!error||error.code==='ERR_SERVER_NOT_RUNNING')resolve();
              else reject(error);
            });
          }catch(error){
            if(error.code==='ERR_SERVER_NOT_RUNNING')resolve();
            else reject(error);
          }
        });
      }finally{
        clearTimeout(deadline);
        if(pool)await pool.end();
      }
    })();
    return pending;
  };
}

export function installShutdownSignals(shutdown,{
  source=process,onError=()=>{process.exitCode=1;},
}={}){
  if(typeof shutdown!=='function'||!source?.on||!source?.off)
    throw new TypeError('Invalid signal handler configuration');
  const stop=()=>{
    source.off('SIGTERM',handle);
    source.off('SIGINT',handle);
  };
  const handle=()=>{
    stop();
    Promise.resolve().then(shutdown).catch(onError);
  };
  source.on('SIGTERM',handle);
  source.on('SIGINT',handle);
  return stop;
}
