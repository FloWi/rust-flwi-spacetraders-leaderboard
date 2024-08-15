-- Add migration script here
drop view if exists v_construction_leaderboard;

create view v_construction_leaderboard as
with agent_construction_summary as (select construction_site_id, group_concat(agent_symbol, ',') as agents_in_system_csv
                                    from (select agent_symbol, construction_site_id from main.static_agent_info order by construction_site_id, agent_symbol) sub
                                    group by construction_site_id)
   , events_per_material as (select first_event.first_ts   as ts_start_of_reset
                                  , r.reset                as reset_date
                                  , cr.trade_symbol
                                  , cur.fulfilled
                                  , cr.required
                                  , cs.jump_gate_waypoint_symbol
                                  , first_event.query_time as ts_first_construction_event
                                  , last_event.query_time  as ts_last_construction_event
                                  , cur.is_jump_gate_complete
                                  , agents_in_system_csv
                             from mat_view_material_delivery_events first_event
                                      join main.construction_site cs
                                           on first_event.construction_site_id = cs.id
                                      join reset_date r
                                           on cs.reset_id = r.reset_id
                                      join agent_construction_summary acs
                                           on acs.construction_site_id = cs.id
                                      join main.construction_requirement cr
                                           on first_event.construction_requirement_id = cr.id
                                               and first_event.delivery_event = 'first'
                                      left join mat_view_material_delivery_events last_event
                                                on first_event.construction_requirement_id = last_event.construction_requirement_id
                                                    and first_event.construction_site_id = last_event.construction_site_id
                                                    and last_event.delivery_event = 'last'
                                      join mat_view_current_construction_progress cur
                                           on cur.reset_id = cs.reset_id
                                               and cur.construction_site_id = cs.id
                                               and cur.construction_requirement_id = cr.id)
   , events_per_jump_gate as (select reset_date
                                   , ts_start_of_reset
                                   , jump_gate_waypoint_symbol
                                   , agents_in_system_csv
                                   , min(ts_first_construction_event)                                           as ts_start_jump_gate_construction
                                   , case when (is_jump_gate_complete) then max(ts_last_construction_event) end as ts_finish_jump_gate_construction
                                   , is_jump_gate_complete
                              from events_per_material
                              group by reset_date
                                     , ts_start_of_reset
                                     , jump_gate_waypoint_symbol
                                     , agents_in_system_csv)
   , event_durations as (select *
                              , round((strftime('%s', ts_start_jump_gate_construction) - strftime('%s', ts_start_of_reset)) / 60)  AS duration_minutes__start_fortnight__start_jump_gate_construction
                              , round((strftime('%s', ts_finish_jump_gate_construction) - strftime('%s', ts_start_of_reset)) / 60) AS duration_minutes__start_fortnight__finish_jump_gate_construction
                              , round((strftime('%s', ts_finish_jump_gate_construction) - strftime('%s', ts_start_jump_gate_construction)) /
                                      60)                                                                                          AS duration_minutes__jump_gate_construction
                         from events_per_jump_gate)
   , ranked as (select reset_date
                     , ts_start_of_reset
                     , jump_gate_waypoint_symbol
                     , agents_in_system_csv
                     , ts_start_jump_gate_construction
                     , ts_finish_jump_gate_construction
                     , cast(duration_minutes__start_fortnight__start_jump_gate_construction as int)                                               as duration_minutes__start_fortnight__start_jump_gate_construction
                     , cast(duration_minutes__start_fortnight__finish_jump_gate_construction as int)                                              as duration_minutes__start_fortnight__finish_jump_gate_construction
                     , cast(duration_minutes__jump_gate_construction as int)                                                                      as duration_minutes__jump_gate_construction
                     , rank() over (partition by reset_date order by duration_minutes__jump_gate_construction nulls last )                        as rank__jump_gate_construction
                     , rank() over (partition by reset_date order by duration_minutes__start_fortnight__start_jump_gate_construction nulls last)  as rank__start_fortnight__start_jump_gate_construction
                     , rank() over (partition by reset_date order by duration_minutes__start_fortnight__finish_jump_gate_construction nulls last) as rank__start_fortnight__finish_jump_gate_construction
                from event_durations)
select *
from ranked
