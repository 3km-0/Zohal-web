export function createLogger(service, requestId) {
  function emit(level, message, meta) {
    const payload = {
      level,
      service,
      request_id: requestId,
      message,
      ...(meta && typeof meta === "object" ? meta : {}),
    };
    const line = JSON.stringify(payload);
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    info(message, meta) {
      emit("info", message, meta);
    },
    warn(message, meta) {
      emit("warn", message, meta);
    },
    error(message, meta) {
      emit("error", message, meta);
    },
  };
}
