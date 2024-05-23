import {createFileRoute} from "@tanstack/react-router";
import React from "react";
import {useInfiniteQuery} from "@tanstack/react-query";
import {Button} from "../@/components/ui/button.tsx";

export const Route = createFileRoute("/pagination-playground")({
  component: PaginationPlaygroundComponent,
});

function PaginationPlaygroundComponent() {
  const {
    status,
    data,
    error,
    isFetching,
    isFetchingNextPage,
    isFetchingPreviousPage,
    fetchNextPage,
    fetchPreviousPage,
    hasNextPage,
    hasPreviousPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["projects"],
    queryFn: async ({pageParam}) => {
      const res = await loadData(pageParam);
      return res;
    },
    initialPageParam: 0,
    getPreviousPageParam: (firstPage, allPages, firstPageParam, allPageParams) => {
      return firstPage.previousId ?? undefined;
    },
    getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) => {
      let maxDate = lastPage.data
        .map((d) => d.serverTime)
        .toSorted()
        .toReversed()
        .at(0);
      let ageInMs = Date.now() - (maxDate?.getTime() ?? 0);

      let canGetMore = ageInMs > 10 * 1000;

      return lastPage.nextId ?? undefined;
    },
    maxPages: 3,
  });

  return (
    <>
      <div className="flex flex-col gap-4">
        <Button onClick={() => refetch({})}>Refetch</Button>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </>
  );
}

type DataType = { name: string; serverTime: Date; id: number };
type Page = {
  nextId: number | null;
  previousId: number | null;
  data: DataType[];
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// an endpoint for getting projects data
export const loadData: (cursor: number) => Promise<Page> = async (cursor: number) => {
  const pageSize = 4;

  const data = Array(pageSize)
    .fill(0)
    .map((_, i) => {
      return {
        name: "Project " + (i + cursor),
        serverTime: new Date(Date.now()),
        id: i + cursor,
      };
    });

  const nextId = cursor < 20 ? data[data.length - 1].id + 1 : null;
  const previousId = cursor > -20 ? data[0].id - pageSize : null;

  await wait(300);

  return {
    data,
    nextId,
    previousId,
  };
};
