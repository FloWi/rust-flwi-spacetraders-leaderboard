pull-data:
  rm -f /Users/florian_witteler/programming/spacetraders/flwi-spacetraders/data/database/flwi-spacetraders-leaderboard-reset_2024_04_28.db
  cd /Users/florian_witteler/programming/spacetraders/flwi-spacetraders && flyctl ssh sftp get /data/database/flwi-spacetraders-leaderboard-reset_2024_04_28.db data/database/flwi-spacetraders-leaderboard-reset_2024_04_28.db

migrate:
  cargo sqlx database reset -y
  cd notebooks && jupyter execute polars_normalize_leaderboard.ipynb

generate-openapi-spec-and-client:
  cargo run -- generate-openapi
  cd flwi-spacetraders-leaderboard && yarn codegen
