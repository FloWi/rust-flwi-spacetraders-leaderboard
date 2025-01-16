-- experimenting with refresh of latest reset data only
DROP VIEW IF EXISTS v_material_delivery_events_of_latest_reset;
CREATE VIEW v_material_delivery_events_of_latest_reset as
with lagged as (select construction_log_id
                     , construction_requirement_id
                     , fulfilled
                     , job_id
                     , construction_site_id
                     , is_complete
                     , trade_symbol
                     , required
                     , cs.reset_id
                     , jump_gate_waypoint_symbol
                     , reset
                     , first_ts
                     , query_time
                     , lag(cm.fulfilled) over (partition by cl.construction_site_id, cm.construction_requirement_id order by jr.query_time) as prev_fulfilled
                from construction_material_log cm
                         join main.construction_log cl on cm.construction_log_id = cl.id
                         join main.job_run jr on cl.job_id = jr.id
                         join main.construction_requirement cr on cm.construction_requirement_id = cr.id
                         join main.construction_site cs on cl.construction_site_id = cs.id
                         join main.reset_date rd on cr.reset_id = rd.reset_id
                where rd.reset_id = (select max(main.reset_date.reset_id) from reset_date))
select lagged.reset_id
     , construction_site_id
     , construction_requirement_id
     , first_ts
     , query_time
     , strftime('%s', query_time) - strftime('%s', first_ts) as duration_seconds
     , case
           when prev_fulfilled = 0 then 'first'
           when fulfilled = required then 'last'
    end                                                      as delivery_event
from lagged
where abs(fulfilled - prev_fulfilled) < required --filter out broken entries
  and fulfilled > prev_fulfilled                 --filter out broken entries
  and ((prev_fulfilled = 0 and fulfilled > 0)
    or fulfilled = required and prev_fulfilled < required)
;

