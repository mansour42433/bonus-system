import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Processing from "./pages/Processing";
import SavedReports from "./pages/SavedReports";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import RepReport from "./pages/RepReport";
import ProductReport from "./pages/ProductReport";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Dashboard} />
      <Route path={"/processing"} component={Processing} />
      <Route path={"/saved-reports"} component={SavedReports} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/reports"} component={Reports} />
      <Route path={"/rep-report"} component={RepReport} />
      <Route path={"/product-report"} component={ProductReport} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
