-- NOTE that these statements are _not_ compile-time checked by sqlx since it doesn't understand the creation of temporary tables

create temporary table tmp_mat_view_material_delivery_events as
select *
from mat_view_material_delivery_events
where 0
;


insert into tmp_mat_view_material_delivery_events (reset_id,
                                                   construction_site_id,
                                                   construction_requirement_id,
                                                   first_ts,
                                                   query_time,
                                                   duration_seconds,
                                                   delivery_event)
select reset_id,
       construction_site_id,
       construction_requirement_id,
       first_ts,
       query_time,
       duration_seconds,
       delivery_event
from v_material_delivery_events_of_latest_reset
;


create temporary table tmp_mat_view_current_construction_progress as
select *
from mat_view_current_construction_progress
where 0
;

insert into tmp_mat_view_current_construction_progress (is_jump_gate_complete,
                                                        construction_site_id,
                                                        construction_requirement_id,
                                                        fulfilled,
                                                        reset_id)
with last_entry_of_reset as (select *
                             from (select r.reset_id
                                        , r.first_ts
                                        , r.reset
                                        , row_number() over (partition by jr.reset_id order by jr.query_time desc) as rn
                                        , jr.query_time                                                            as ts_latest_entry_of_reset
                                        , jr.id                                                                    as job_run_id_latest_entry
                                   from reset_date r
                                            join main.job_run jr
                                                 on r.reset_id = jr.reset_id) sub
                             where rn = 1)

select cl.is_complete as is_jump_gate_complete
     , cl.construction_site_id
     , cml.construction_requirement_id
     , cml.fulfilled
     , l.reset_id
from construction_material_log cml
         join main.construction_log cl
              on cml.construction_log_id = cl.id
         join main.construction_site cs
              on cl.construction_site_id = cs.id
         join main.construction_requirement cr
              on cml.construction_requirement_id = cr.id
         join last_entry_of_reset l
              on l.job_run_id_latest_entry = cl.job_id
where required > 1
;


delete
from mat_view_material_delivery_events
where reset_id = (select max(main.reset_date.reset_id) from reset_date)
;


insert into mat_view_material_delivery_events (reset_id,
                                               construction_site_id,
                                               construction_requirement_id,
                                               first_ts,
                                               query_time,
                                               duration_seconds,
                                               delivery_event)
select reset_id,
       construction_site_id,
       construction_requirement_id,
       first_ts,
       query_time,
       duration_seconds,
       delivery_event
from tmp_mat_view_material_delivery_events
;


delete
from mat_view_current_construction_progress
where true
;

insert into mat_view_current_construction_progress (is_jump_gate_complete,
                                                    construction_site_id,
                                                    construction_requirement_id,
                                                    fulfilled,
                                                    reset_id)
select is_jump_gate_complete,
       construction_site_id,
       construction_requirement_id,
       fulfilled,
       reset_id
from tmp_mat_view_current_construction_progress
;


drop table tmp_mat_view_material_delivery_events
;


drop table tmp_mat_view_current_construction_progress
;

