export function formatRelativeTime(timestamp) {
  if (!timestamp) return '未更新';
  const value = typeof timestamp.toMillis === 'function' ? timestamp.toMillis() : timestamp;
  if (!value) return '未更新';
  const diffMs = Date.now() - value;
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}日前`;
}
