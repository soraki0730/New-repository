export function normalizeFromFirestore(docId, data) {
  const id = data?.id || docId;
  const toMs = (v) => {
    if (v == null) return null;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v === 'number') return v;
    // Date
    if (v instanceof Date) return v.getTime();
    return null;
  };
  const createdAtMs = toMs(data?.createdAt);
  const updatedAtMs = toMs(data?.updatedAt);
  const completedAtMs = toMs(data?.completedAt);

  const name = data?.name ?? data?.title ?? '名称未設定';
  let date = data?.date ?? null;
  if (!date) {
    const ms = createdAtMs ?? Date.now();
    date = new Date(ms).toISOString().split('T')[0];
  }
  const done = (typeof data?.done === 'boolean') ? data.done : ((typeof data?.completed === 'boolean') ? data.completed : false);
  const progress = (typeof data?.progress === 'number') ? data.progress : (done ? 100 : 0);

  return {
    id: String(id),
    name,
    category: data?.category ?? '未分類',
    date,
    startTime: data?.startTime ?? '',
    endTime: data?.endTime ?? '',
    done,
    progress,
    createdAt: createdAtMs,
    updatedAt: updatedAtMs,
    completedAt: completedAtMs
  };
}

export function localToFirestorePayload(local) {
  const payload = {
    id: local.id,
    name: local.name ?? local.title ?? '名称未設定',
    title: local.name ?? local.title ?? '名称未設定',
    category: local.category ?? '未分類',
    date: local.date ?? null,
    startTime: local.startTime ?? '',
    endTime: local.endTime ?? '',
    done: local.done ?? local.completed ?? false,
    completed: local.done ?? local.completed ?? false,
    progress: typeof local.progress === 'number' ? local.progress : ((local.done ?? false) ? 100 : 0)
  };
  if (typeof local.createdAt === 'number') payload.createdAt = new Date(local.createdAt);
  if (typeof local.updatedAt === 'number') payload.updatedAt = new Date(local.updatedAt);
  if (typeof local.completedAt === 'number') payload.completedAt = new Date(local.completedAt);
  return payload;
}
