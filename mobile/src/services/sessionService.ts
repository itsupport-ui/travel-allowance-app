type SessionExpiredListener = () => void;

const listeners = new Set<SessionExpiredListener>();
let sessionExpiryNotified = false;

export const subscribeToSessionExpiry = (
  listener: SessionExpiredListener
): (() => void) => {
  listeners.add(listener);

  if (sessionExpiryNotified) {
    listener();
  }

  return () => {
    listeners.delete(listener);
  };
};

export const notifySessionExpired = (): void => {
  if (sessionExpiryNotified) {
    return;
  }

  sessionExpiryNotified = true;
  listeners.forEach((listener) => listener());
};

export const resetSessionExpiry = (): void => {
  sessionExpiryNotified = false;
};
