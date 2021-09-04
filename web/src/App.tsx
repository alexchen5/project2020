import React, { useState } from "react";
import HomePage from './pages/HomePage';
import LoginPage from "pages/LoginPage";
import { UidContext } from "utils/globalContext";
import { BrowserRouter, Route, Switch } from "react-router-dom";
import firebase from "firebase/app";

function App() {
  const [isLoadingUid, setIsLoadingUid] = React.useState(true);
  const [uid, setUid] = useState(false as string | false); 

  // Listen to the Firebase Auth state and set the local state.
  React.useEffect(() => {
    const unregisterAuthObserver = firebase.auth().onAuthStateChanged(user => {
      setUid(!!user && user.uid);
      setIsLoadingUid(false);
    });
    return () => unregisterAuthObserver(); // Make sure we un-register Firebase observers when the component unmounts.
  }, []);

  return (<>{
    <UidContext.Provider value={{ uid }}>
      <BrowserRouter>
        <Switch>
          <Route
            exact
            path="/koala"
            render={() => <p>koala</p>}
          />
          <Route
            exact
            path={["/", "/calendar", "/notes", "/old-notes"]}
            render={() => {
              // render blank page if uid is still loading
              if (isLoadingUid) return <></>;

              // render the login component if user is not logged in
              if (!uid) return <LoginPage/>;

              // otherwise we can display the actual app
              return <HomePage/>;
            }}
          />
        </Switch>
      </BrowserRouter>
    </UidContext.Provider>
          
  }</>);
}

export default App;
