-- Add migration script here
update job_run
set query_time = datetime(
        strftime('%Y-%m-%d %H:', datetime(query_time, '+1 minute')) ||
        printf('%02d:',
               (strftime('%M', datetime(query_time, '+1 minute')) / 5) * 5 +
               CASE
                   WHEN strftime('%M', datetime(query_time, '+1 minute')) % 5 >= 2.5 THEN 5
                   ELSE 0
                   END
        ) || '00'
                 )
where true;


update job_run
set event_time_minutes = sub.fixed_event_time_minutes
from (SELECT j.id
           , (strftime('%s', j.query_time) - strftime('%s', r.first_ts)) / 60.0 as fixed_event_time_minutes
      FROM job_run j
               JOIN reset_date r ON j.reset_id = r.reset_id) sub
where sub.id = job_run.id
;

