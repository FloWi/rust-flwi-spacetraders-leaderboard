-- Add migration script here

create table reset_date
(
    reset_id integer  not null primary key,
    reset    date     not null,
    first_ts datetime not null
) ;

create table construction_site
(
    id                        integer not null primary key,
    reset_id                  integer not null,
    jump_gate_waypoint_symbol text    not null,
    foreign key (reset_id) references reset_date (reset_id),
    unique (reset_id, jump_gate_waypoint_symbol)
) ;

create table construction_requirement
(
    id           integer not null primary key,
    reset_id     integer not null,
    trade_symbol text    not null,
    required     int     not null,
    foreign key (reset_id) references reset_date (reset_id),
    unique (reset_id, trade_symbol)
) ;

create table static_agent_info
(
    id                                 integer  not null primary key,
    agent_symbol                       text     not null,
    agent_headquarters_waypoint_symbol text     not null,
    construction_site_id               integer  not null,
    starting_faction                   text     not null, -- must be nullable, since we didn't collect it all the time
    reset_id                           integer  not null,
    query_time                         datetime not null,
    foreign key (reset_id) references reset_date (reset_id),
    foreign key (construction_site_id) references construction_site (id)
);

create table job_run
(
    id         integer  not null primary key,
    reset_id   integer  not null,
    query_time datetime not null,
    foreign key (reset_id) references reset_date (reset_id)
) ;

create table agent_log
(
    agent_id   integer not null,
    job_id     integer not null,
    credits    INT8  not null,
    ship_count integer not null,
    foreign key (agent_id) references static_agent_info (id),
    foreign key (job_id) references job_run (id)
) ;

create table construction_log
(
    id                   integer not null primary key,
    job_id               integer not null,
    construction_site_id integer not null,
    is_complete          bool    not null,
    foreign key (job_id) references job_run (id),
    foreign key (construction_site_id) references construction_site (id)
) ;

create table construction_material_log
(
    construction_log_id         integer not null,
    construction_requirement_id integer not null,
    fulfilled                   integer not null,
    foreign key (construction_log_id) references construction_log (id),
    foreign key (construction_requirement_id) references construction_requirement (id)
) ;



-- drop view v_material_delivery_events;
create view v_material_delivery_events as
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
                         join main.reset_date rd on cr.reset_id = rd.reset_id)
select lagged.reset_id
     , construction_site_id
     , construction_requirement_id
     , first_ts
     , query_time
     , timediff(query_time, first_ts)                        as duration
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
