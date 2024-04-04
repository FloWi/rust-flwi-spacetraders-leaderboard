pull-data:
  rm /Users/florian_witteler/programming/spacetraders/flwi-spacetraders/data/database/flwi-spacetraders-leaderboard-reset_2024_03_24.db
  cd /Users/florian_witteler/programming/spacetraders/flwi-spacetraders && flyctl ssh sftp get /data/database/flwi-spacetraders-leaderboard-reset_2024_03_24.db data/database/flwi-spacetraders-leaderboard-reset_2024_03_24.db

migrate:
  cargo sqlx database reset -y
  cd notebooks && jupyter execute polars_normalize_leaderboard.ipynb
