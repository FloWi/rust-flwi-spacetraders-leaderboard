use polars::frame::UniqueKeepStrategy;
use polars::prelude::{col, IntoLazy, LazyFrame};
use tracing::{event, span, Level};
use tracing_subscriber::fmt::format::FmtSpan;

fn main() {
    // install global collector configured based on RUST_LOG env var.
    tracing_subscriber::fmt()
        .with_span_events(FmtSpan::CLOSE)
        .init();

    event!(Level::INFO, "starting");

    let span = span!(Level::INFO, "reading");
    event!(Level::INFO, "created lazy dataframe");
    let lazy_df = LazyFrame::scan_parquet("data/all_resets.parquet", Default::default())
        .expect("scan parquet");

    println!("{}", lazy_df.describe_plan());
    drop(span);

    let span = span!(
        Level::INFO,
        "selecting distinct reset_dates from lazy frame"
    );
    let df = lazy_df
        .clone()
        .select([col("reset_date")])
        .unique(None, UniqueKeepStrategy::Any);
    println!("{}", df.describe_plan());
    drop(span);

    let span = span!(Level::INFO, "collecting whole dataframe into memory");
    let df = lazy_df.clone().collect().unwrap();
    drop(span);

    let span = span!(
        Level::INFO,
        "collecting distinct reset_dates from in-memory dataframe"
    );
    let df = df
        .lazy()
        .select([col("reset_date")])
        .unique(None, UniqueKeepStrategy::Any);

    println!("{}", df.describe_plan());

    let df = df.collect().expect("reading df");
    event!(Level::INFO, "collected dataframe");
    drop(span);

    println!("{}", df);
    event!(Level::INFO, "printed dataframe");
}
