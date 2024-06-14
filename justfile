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

build-arm64-docker-image:
  docker build --platform=linux/arm64 --tag flwi-spacetraders-rust-leaderboard .

deploy-fly-io:
  fly deploy --local-only

replace-db-from-backup-flwi-de:
  ssh -C hetzner-flwi sudo service docker-compose-flwi-leaderboard stop
  ssh -C hetzner-flwi rm -f /home/flwi/flwi-spacetraders-leaderboard/db/flwi-leaderboard.db*
  ssh -C hetzner-flwi cp /home/flwi/flwi-spacetraders-leaderboard/db/backup.db /home/flwi/flwi-spacetraders-leaderboard/db/flwi-leaderboard.db
  ssh -C hetzner-flwi sudo service docker-compose-flwi-leaderboard start


# this restart-command doesn't need a password for sudo
# https://askubuntu.com/questions/692701/allowing-user-to-run-systemctl-systemd-services-without-password
# /etc/sudoers.d/permissions_for_flwi_user
# %flwi ALL=NOPASSWD: /usr/sbin/service docker-compose-* restart
deploy-flwi-de:
  #!/usr/bin/env bash
  set -euxo pipefail
  VERSION=$(git log -1 --pretty=%h)
  REPO="docker-registry.flwi.de/flwi-spacetraders-rust-leaderboard:"
  TAG="$REPO$VERSION"
  LATEST="${REPO}latest"
  docker tag flwi-spacetraders-rust-leaderboard "$TAG"
  docker tag flwi-spacetraders-rust-leaderboard "$LATEST"
  docker push "$TAG"
  docker push "$LATEST"
  ssh -C hetzner-flwi sudo service docker-compose-flwi-leaderboard restart

copy-backup-to-flwi-de:
  ssh -C hetzner-flwi rm -f ~/flwi-spacetraders-leaderboard/db/backup.db
  scp -C data/backup-db/backup.db hetzner-flwi:~/flwi-spacetraders-leaderboard/db

# delete local database, download production database
download-prod-db:
  mkdir -p data/backup-db
  rm -f data/backup-db/backup.db
  rm -f data/backup-db/backup.db-shm
  rm -f data/backup-db/backup.db-wal
  flyctl ssh console -C "rm -f /tmp/backup.db"
  flyctl ssh console -C "sqlite3 /data/flwi-leaderboard.db '.backup /tmp/backup.db'"
  flyctl ssh sftp get /tmp/backup.db data/backup-db/backup.db || true

copy-db-to-fly-volume:
  rm temp_data/*.db*
  sqlite3 data/flwi-leaderboard.db '.backup temp_data/flwi-leaderboard.db'
  flyctl ssh console --command "mkdir -p /data"
  flyctl ssh console --command "rm -f /data/flwi-leaderboard.db*"
  flyctl ssh console --command "rm -f /tmp/flwi-leaderboard.db.gz"
  gzip --keep temp_data/flwi-leaderboard.db
  echo 'flyctl ssh sftp shell'
  echo "put temp_data/flwi-leaderboard.db.gz /tmp/flwi-leaderboard.db.gz"
  echo "after copy is complete, run"
  echo 'just extract-file-and-restart'

extract-file-and-restart:
  flyctl ssh console --command "rm -f /data/flwi-leaderboard.db*"
  echo "unpack file manually"
  echo 'flyctl ssh console --command "gunzip -c /tmp/flwi-leaderboard.db.gz > /data/flwi-leaderboard.db"'
  echo 'restart machine with following command'
  echo 'fly machine restart 56830157a169d8'
