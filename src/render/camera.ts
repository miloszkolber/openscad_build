export function formatCamera(value: string): string {
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 6 && parts.length !== 7) {
    throw new Error('Camera must contain 6 or 7 comma-separated finite numbers.');
  }

  return parts
    .map((part) => {
      if (!isCliNumber(part)) {
        throw new Error('Camera must contain only finite numbers.');
      }
      const parsed = Number(part);
      if (!Number.isFinite(parsed)) {
        throw new Error('Camera must contain only finite numbers.');
      }
      return String(parsed);
    })
    .join(',');
}

function isCliNumber(value: string): boolean {
  return /^[-+]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][-+]?\d+)?$/.test(value);
}
