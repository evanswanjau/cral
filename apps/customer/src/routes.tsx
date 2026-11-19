import { Navigate, type RouteObject } from "react-router-dom";
import { SiteShell } from "./components/site/SiteShell.js";
import { Home } from "./pages/Home.js";
import { Browse } from "./pages/Browse.js";
import { LegacyBrowseRedirect } from "./components/routing/LegacyBrowseRedirect.js";
import { LegacyBookRedirect } from "./components/routing/LegacyBookRedirect.js";
import { CarsHome } from "./pages/cars/CarsHome.js";
import { TrucksHome } from "./pages/trucks/TrucksHome.js";
import { TrucksSearch } from "./pages/trucks/TrucksSearch.js";
import { MachineryHome } from "./pages/machinery/MachineryHome.js";
import { MachinerySearch } from "./pages/machinery/MachinerySearch.js";
import { TowingHome } from "./pages/towing/TowingHome.js";
import { Drivers } from "./pages/Drivers.js";
import { DriverBook } from "./pages/DriverBook.js";
import { CarDetail } from "./pages/CarDetail.js";
import { Booking } from "./pages/Booking.js";
import { Documents } from "./pages/Documents.js";
import { Trips } from "./pages/Trips.js";
import { TripDetail } from "./pages/TripDetail.js";
import { Notifications } from "./pages/Notifications.js";
import { HowItWorks } from "./pages/HowItWorks.js";
import { HowWeProtectYou } from "./pages/HowWeProtectYou.js";
import { Corporate } from "./pages/Corporate.js";
import { About } from "./pages/About.js";
import { Help } from "./pages/Help.js";
import { Contact } from "./pages/Contact.js";
import { Legal } from "./pages/Legal.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { SignIn } from "./pages/SignIn.js";
import { CreateAccount } from "./pages/CreateAccount.js";
import { ForgotPassword } from "./pages/ForgotPassword.js";
import { ResetPassword } from "./pages/ResetPassword.js";
import { Sessions } from "./pages/Sessions.js";
import { GarageHome } from "./pages/garage/GarageHome.js";
import { GarageRequestPage } from "./pages/garage/GarageRequestPage.js";
import { GarageOrderPage } from "./pages/garage/GarageOrderPage.js";
import { CarServiceRecord } from "./pages/CarServiceRecord.js";
import { MyCars } from "./pages/MyCars.js";

/**
 * The customer route table, moved out of App.tsx unchanged (UI1a) so
 * `tools/check-links.mjs` and later sub-site PRs read one file.
 */
/**
 * Route map. Everything but the four auth screens sits under `SiteShell`
 * (masthead + footer), including the auth-gated pages.
 * `RequireAuth` preserves the path it interrupted.
 *
 * The seven marketing pages are real now (C9) - see each page's own
 * comment on where its copy came from (not a canvas file; none was
 * reachable this session). "List your car" is not one of these pages -
 * every such link hands off straight to the merchant app's own landing
 * page (`lib/merchant-app.ts#merchantLandingUrl`), where listing a car
 * has always actually lived, rather than to an explainer page of its own.
 *
 * C8 (bookings, handover status, notifications, account) is also real now,
 * same not-pulled-from-canvas footing - `/bookings/:id` shows the handover's
 * *state* (a code is on its way / pickup or return is done), never the
 * code itself (only its hash exists server-side; the real code only ever
 * goes out by email). `/notifications` is a renter's own feed off
 * Migration B (`notifications.user_id`) - see docs/plans/customer-portal.md.
 * `Cruz Customer Portal.dc.html` (trips/account's own canvas file) still
 * hasn't been pulled this session; swap this for its copy once it is.
 */
export const routes: RouteObject[] = [
  {
    element: <SiteShell />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/browse", element: <LegacyBrowseRedirect /> },
      { path: "/cars/search", element: <Browse /> },
      { path: "/cars", element: <CarsHome /> },
      // Trucks' own sub-site (UI2a). `/trucks/:id` is CarDetail with the
      // route-first TruckRequestPanel, and `/trucks/:id/request` is the
      // same Booking flow; each forwards to the other path when the
      // listing isn't (or is) a truck.
      { path: "/trucks", element: <TrucksHome /> },
      { path: "/trucks/search", element: <TrucksSearch /> },
      { path: "/trucks/:id", element: <CarDetail /> },
      { path: "/trucks/:id/request", element: <Booking /> },
      // Machinery's own sub-site (UI2b): the cars pattern with the
      // category locked. Detail and booking are CarDetail and Booking, which
      // forward a listing to its own sub-site's path.
      { path: "/machinery", element: <MachineryHome /> },
      { path: "/machinery/search", element: <MachinerySearch /> },
      { path: "/machinery/:id", element: <CarDetail /> },
      { path: "/machinery/:id/book", element: <Booking /> },
      // Parts is not live yet: it lands on the front door's "Coming to
      // CRAL" block (owner decision 2, 2026-11-18) until PT2 builds the
      // sub-site. `/services` meant garage services; it goes to `/garage`
      // now that garage is live (GS4).
      { path: "/parts", element: <Navigate to="/#coming" replace /> },
      { path: "/services", element: <Navigate to="/garage" replace /> },
      { path: "/cars/:id", element: <CarDetail /> },
      // Not behind RequireAuth: see the note on the booking route below.
      { path: "/cars/:id/book", element: <Booking /> },
      // Drivers and towing (UI3): public, like the other sub-sites. Only
      // sending a request asks for an account; `GET /catalog/drivers/:id`
      // never needed one. `/services/towing` redirects forever: the quote
      // email's "View request" button pointed there.
      { path: "/drivers", element: <Drivers /> },
      { path: "/drivers/:id", element: <DriverBook /> },
      { path: "/towing", element: <TowingHome /> },
      // Garage services (Phase 4): public like towing. A live sub-site
      // since GS4 (tab, door, footer, sitemap).
      { path: "/garage", element: <GarageHome /> },
      { path: "/services/towing", element: <Navigate to="/towing" replace /> },
      { path: "/how-it-works", element: <HowItWorks /> },
      { path: "/how-we-protect-you", element: <HowWeProtectYou /> },
      { path: "/corporate", element: <Corporate /> },
      { path: "/about", element: <About /> },
      { path: "/help", element: <Help /> },
      { path: "/contact", element: <Contact /> },
      { path: "/legal", element: <Legal /> },
      // Not behind RequireAuth: a signed-out visitor lands here straight
      // from "Request these dates" and signs up inline as part of sending
      // the request - see Booking.tsx.
      { path: "/book/:id", element: <LegacyBookRedirect /> },

      {
        element: <RequireAuth />,
        children: [
          { path: "/documents", element: <Documents /> },
          { path: "/bookings", element: <Trips /> },
          { path: "/bookings/:id", element: <TripDetail /> },
          { path: "/notifications", element: <Notifications /> },
          { path: "/account", element: <Sessions /> },
          { path: "/my-cars", element: <MyCars /> },
          { path: "/my-cars/:id", element: <CarServiceRecord /> },
          { path: "/garage/requests/:id", element: <GarageRequestPage /> },
          { path: "/garage/orders/:id", element: <GarageOrderPage /> },
        ],
      },
    ],
  },
  // The auth screens are full-page, outside SiteShell: brand panel on the
  // left, form on the right - the merchant portal's layout (owner's call,
  // 2026-09-24). `?next=` carries the interrupted path through them.
  { path: "/sign-in", element: <SignIn /> },
  { path: "/create-account", element: <CreateAccount /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
];
