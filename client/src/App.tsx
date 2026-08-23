import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import Home from "./pages/Home";
import BlogPage from "./pages/BlogPage";
import LivePage from "./pages/LivePage";
import SubscriptionSuccess from "./pages/SubscriptionSuccess";
import SubscriptionCancel from "./pages/SubscriptionCancel";
import PricingPage from "./pages/PricingPage";
import AuthError from "./pages/AuthError";
import PredictionPage from "./pages/PredictionPage";
import AdminNewsPage from "./pages/AdminNewsPage";
import AdminCsvUpload from "./pages/AdminCsvUpload";
import OfficialOddsImportPage from "./pages/OfficialOddsImportPage";
import OddsSimulationPage from "./pages/OddsSimulationPage";
import OddsHistoryPage from "./pages/OddsHistoryPage";
import RaceCalendarPage from "./pages/RaceCalendarPage";
import RaceResultPage from "./pages/RaceResultPage";
import NarPredictionPage from "./pages/NarPredictionPage";
import HorseEncyclopediaPage from "./pages/HorseEncyclopediaPage";
import JockeyListPage from "./pages/JockeyListPage";
import PredictionDashboardPage from "./pages/PredictionDashboardPage";
import TicketPerformancePage from "./pages/TicketPerformancePage";
import PredictionHistoryPage from "./pages/PredictionHistoryPage";
import SyntheticPredictionLabPage from "./pages/SyntheticPredictionLabPage";
import TodaysPredictions from "./pages/TodaysPredictions";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/blog"} component={BlogPage} />
      <Route path={"/blog/:slug"} component={BlogPage} />
      <Route path={"/live"} component={LivePage} />
      <Route path={"/predictions"} component={PredictionPage} />
      <Route path={"/pricing"} component={PricingPage} />
      <Route path={"/subscription/success"} component={SubscriptionSuccess} />
      <Route path={"/subscription/cancel"} component={SubscriptionCancel} />
      <Route path={"/auth-error"} component={AuthError} />
      <Route path={"/calendar"} component={RaceCalendarPage} />
      <Route path={"/race-result"} component={RaceResultPage} />
      <Route path={"/nar-predictions"} component={NarPredictionPage} />
      <Route path={"/horses"} component={HorseEncyclopediaPage} />
      <Route path={"/jockeys"} component={JockeyListPage} />
      <Route path={"/dashboard"} component={PredictionDashboardPage} />
      <Route path={"/todays-predictions"} component={TodaysPredictions} />
      <Route path={"/prediction-history"} component={PredictionHistoryPage} />
      <Route path={"/analytics/ticket-performance"} component={TicketPerformancePage} />
      <Route path={"/admin/news"} component={AdminNewsPage} />
      <Route path={"/admin/csv-upload"} component={AdminCsvUpload} />
      <Route path={"/admin/official-odds"} component={OfficialOddsImportPage} />
      <Route path={"/admin/odds-simulation"} component={OddsSimulationPage} />
      <Route path={"/admin/odds-history"} component={OddsHistoryPage} />
      <Route path={"/admin/synthetic-predictions"} component={SyntheticPredictionLabPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <SubscriptionProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </SubscriptionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
