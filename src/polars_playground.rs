use polars::df;
use polars::prelude::{as_struct, col, IntoLazy};

fn struct_example() {
    let df = df!(
        "symbol" => vec!["X1-ND96-I52","X1-ND96-I52","X1-ND96-I52","X1-VS59-I51","X1-VS59-I51","X1-VS59-I51"],
        "is_complete" => vec![true, true, true, false, false, false],
        "trade_symbol" => vec!["FAB_MATS","ADVANCED_CIRCUITRY","QUANTUM_STABILIZERS","FAB_MATS","ADVANCED_CIRCUITRY","QUANTUM_STABILIZERS"],
        "required" => vec![4000, 1200, 1, 4000, 1200, 1],
        "fulfilled" => vec![4000, 1200, 1, 123, 42, 1],
    ).unwrap();

    println!("{}", df);
    /*
    shape: (6, 5)
    ┌─────────────┬─────────────┬─────────────────────┬──────────┬───────────┐
    │ symbol      ┆ is_complete ┆ trade_symbol        ┆ required ┆ fulfilled │
    │ ---         ┆ ---         ┆ ---                 ┆ ---      ┆ ---       │
    │ str         ┆ bool        ┆ str                 ┆ i32      ┆ i32       │
    ╞═════════════╪═════════════╪═════════════════════╪══════════╪═══════════╡
    │ X1-ND96-I52 ┆ true        ┆ FAB_MATS            ┆ 4000     ┆ 4000      │
    │ X1-ND96-I52 ┆ true        ┆ ADVANCED_CIRCUITRY  ┆ 1200     ┆ 1200      │
    │ X1-ND96-I52 ┆ true        ┆ QUANTUM_STABILIZERS ┆ 1        ┆ 1         │
    │ X1-VS59-I51 ┆ false       ┆ FAB_MATS            ┆ 4000     ┆ 123       │
    │ X1-VS59-I51 ┆ false       ┆ ADVANCED_CIRCUITRY  ┆ 1200     ┆ 42        │
    │ X1-VS59-I51 ┆ false       ┆ QUANTUM_STABILIZERS ┆ 1        ┆ 1         │
    └─────────────┴─────────────┴─────────────────────┴──────────┴───────────┘
         */

    let df_with_struct = df
        .lazy()
        .with_column(
            as_struct([col("trade_symbol"), col("required"), col("fulfilled")].into())
                .alias("materials"),
        )
        .drop(["trade_symbol", "required", "fulfilled"])
        .collect()
        .unwrap();
    println!("{}", df_with_struct);

    let aggregated = df_with_struct
        .lazy()
        .group_by([col("symbol"), col("is_complete")])
        .agg([col("materials")])
        .collect()
        .unwrap();

    println!("{}", aggregated);
}
