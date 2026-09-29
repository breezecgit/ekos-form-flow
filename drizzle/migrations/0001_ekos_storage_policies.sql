create policy "ekos docs read" on storage.objects for select to authenticated
  using (bucket_id = 'ekos-documents');
create policy "ekos docs insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'ekos-documents');
create policy "ekos docs update" on storage.objects for update to authenticated
  using (bucket_id = 'ekos-documents');
