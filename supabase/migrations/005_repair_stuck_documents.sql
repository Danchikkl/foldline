-- Repair documents that were uploaded before the OCR-unavailable fallback was added.
-- This is a one-time cleanup migration. It only touches already-stale queued/processing rows.

update public.processing_jobs
set
  status = 'failed',
  finished_at = coalesce(finished_at, now())
where status in ('queued', 'processing')
  and created_at < now() - interval '2 minutes';

update public.documents
set
  status = 'failed',
  error_message = 'Upload completed successfully. OCR processing is not connected yet.',
  updated_at = now()
where status in ('queued', 'processing')
  and updated_at < now() - interval '2 minutes';
