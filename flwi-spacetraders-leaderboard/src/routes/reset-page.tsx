import {useLoaderData} from "react-router-dom";

interface ResetPageParams {
  request: {},
  params: {
    resetDate: string
  }
}

export async function loader(params: ResetPageParams) {
  //TODO: Load reset date data
  console.log(`inside loader of reset-page. Params: ${JSON.stringify(params)}`)
  return {resetDate: params.params.resetDate};
}

export default function ResetPage() {
  const resetDateData = useLoaderData() as Awaited<ReturnType<typeof loader>>;

  return (
    <div className="">
      Hello, Reset {resetDateData.resetDate}

    </div>
  )

  // existing code
}



