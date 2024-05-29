import React from "react";

export const renderKvPair = (label: string, value: React.ReactNode) => {
  return (
    <>
      <div className="space-y-1 text-left">
        <h4 className="text-sm text-muted-foreground font-medium leading-none">{label}</h4>
        <p className="text-2xl ">{value}</p>
      </div>
    </>
  );
};
