pull-data:
  rm -f /Users/florian_witteler/programming/spacetraders/flwi-spacetraders/data/database/flwi-spacetraders-leaderboard-reset_2024_05_19.db
  cd /Users/florian_witteler/programming/spacetraders/flwi-spacetraders && flyctl ssh sftp get /data/database/flwi-spacetraders-leaderboard-reset_2024_05_19.db data/database/flwi-spacetraders-leaderboard-reset_2024_05_19.db

migrate:
  cargo sqlx database reset -y
  cd notebooks && jupyter execute polars_normalize_leaderboard.ipynb

generate-openapi-spec-and-client:
  cargo run -- generate-openapi --output-path ./flwi-spacetraders-leaderboard/openapi-spec/openapi.json
  cd flwi-spacetraders-leaderboard && yarn codegen

build-fly-docker-image:
  docker build --platform=linux/amd64 --tag registry.fly.io/flwi-spacetraders-rust-leaderboard .

deploy:
  fly deploy --local-only


#copy-db-to-fly-volume:
#  rm temp_data/*.db*
#  sqlite3 data/flwi-leaderboard.db '.backup temp_data/flwi-leaderboard.db'
#  flyctl ssh console --command "mkdir -p /data"
#  flyctl ssh console --command "rm -f /data/flwi-leaderboard.db*"
#  flyctl ssh console --command "rm -f /tmp/flwi-leaderboard.db.gz"
#  gzip --keep temp_data/flwi-leaderboard.db
#  echo 'flyctl ssh sftp shell'
#  echo "put temp_data/flwi-leaderboard.db.gz /tmp/flwi-leaderboard.db.gz"
#  echo "after copy is complete, run"
#  echo 'just extract-file-and-restart'
#
#extract-file-and-restart:
#  flyctl ssh console --command "rm -f /data/flwi-leaderboard.db"
#  echo "unpack file manually"
#  echo 'flyctl ssh console --command "gunzip -c /tmp/flwi-leaderboard.db.gz > /data/flwi-leaderboard.db"'
#  echo 'restart machine with following command'
#  echo 'fly machine restart 56830157a169d8'
