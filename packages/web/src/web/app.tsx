import { Route, Switch } from "wouter";
import Index from "./pages/index";
import SharedView from "./pages/shared";
import { Provider } from "./components/provider";

function App() {
  return (
    <Provider>
      <Switch>
        <Route path="/" component={Index} />
        <Route path="/s/:id">
          {(params) => <SharedView params={params} />}
        </Route>
      </Switch>
    </Provider>
  );
}

export default App;
