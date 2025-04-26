-- Add migration script here
create table agent_registration
(
    reset_date  date not null,
    agent_token text not null
);
