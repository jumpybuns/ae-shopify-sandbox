// A deliberately tiny in-memory queue. In production you'd use BullMQ/SQS/etc,
// but for playing with the ARCHITECTURE (idempotency, retries, backoff) a
// single-process FIFO queue teaches the same lessons without needing Redis
// running on your machine.

const jobs = [];
let processing = false;

export function enqueue(job) {
  jobs.push(job);
  void drain();
}

async function drain() {
  if (processing) return;
  processing = true;
  while (jobs.length) {
    const job = jobs.shift();
    try {
      await job.handler(job.payload);
    } catch (err) {
      console.error(`[queue] job failed:`, err.message);
      if (job.retries > 0) {
        console.log(`[queue] retrying in 2s (${job.retries} retries left)`);
        await new Promise((r) => setTimeout(r, 2000));
        jobs.push({ ...job, retries: job.retries - 1 });
      } else {
        console.error(`[queue] giving up on job after retries exhausted`);
      }
    }
  }
  processing = false;
}
