// Голосовое → MP3. Chrome и Android записывают WebM (Opus), а iPhone такие файлы
// часто не воспроизводит — голосовое «молчит». MP3 играет везде: iPhone, Android, любой браузер.
// Голос: моно, 24 кГц, 48 кбит/с — около 360 КБ за минуту. Кодировщик грузим только при отправке

const SAMPLE_RATE = 24000;
const KBPS = 48;
const FRAME = 1152; // столько отсчётов кодировщик MP3 берёт за раз

export async function voiceToMp3(blob: Blob): Promise<Blob> {
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  // Раскодируем запись тем же браузером, который её сделал
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close().catch(() => {});
  }

  // Моно и 24 кГц: для голоса хватает, файл в разы меньше
  const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const mono = (await offline.startRendering()).getChannelData(0);

  const samples = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const v = Math.max(-1, Math.min(1, mono[i]));
    samples[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }

  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, KBPS);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += FRAME) {
    const chunk = encoder.encodeBuffer(samples.subarray(i, i + FRAME));
    if (chunk.length) parts.push(new Uint8Array(chunk));
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  return new Blob(parts as BlobPart[], { type: "audio/mpeg" });
}
