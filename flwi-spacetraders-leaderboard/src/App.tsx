import {useEffect, useState} from 'react'
import {ApiResetDate, CrateService} from "../generated-src";


function App() {
  const [resetDates, setResetDates] = useState(Array.of<ApiResetDate>())

  useEffect(() => {
    // Execute the fetch call on component mount
    CrateService.getResetDates()
      .then((fetchedData) => {
        // Set the fetched data to state
        setResetDates(fetchedData.reset_dates);
      })
      .catch((error) => {
        console.error('Error fetching data: ', error);
        // Optionally, handle errors or set error state here
      });
  }, []); // Empty dependency array means this effect runs once on mount


  return (
    <>
      <h1>Flwi Spacetraders Leaderboard</h1>
      <div className="bg-amber-400">
        <ul>
          {resetDates.map((item, index) => <li key={index}>{item}</li>)}

        </ul>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
