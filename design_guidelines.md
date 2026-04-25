# Healthcare Booking Platform Design Guidelines

## Design Approach
**Reference-Based Strategy**: Draw inspiration from Fresha (wellness booking), Calendly (appointment scheduling), and Zocdoc (healthcare provider search) to create a trustworthy, modern healthcare booking experience.

**Core Principles**:
- Clinical Trust: Professional, clean aesthetic that inspires confidence in medical services
- Effortless Booking: Streamlined appointment flows with minimal friction
- Provider Credibility: Rich profiles that showcase expertise and build patient trust
- Dashboard Clarity: Information-dense interfaces optimized for quick decision-making

## Typography System

**Font Families** (Google Fonts):
- Primary: Inter (headings, UI elements, body text)
- Accent: DM Sans (provider names, specialty badges)

**Hierarchy**:
- Page Titles: text-4xl to text-5xl, font-semibold
- Section Headers: text-2xl to text-3xl, font-semibold
- Provider Names: text-xl, font-semibold
- Body Text: text-base, font-normal
- Metadata (location, pricing): text-sm, font-medium
- Labels: text-xs uppercase, tracking-wide, font-semibold

## Layout & Spacing System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, 8, 12, 16, 20
- Tight spacing: p-2, gap-2 (within components)
- Standard spacing: p-4, gap-4, m-6 (between elements)
- Section padding: py-12 to py-20, px-6 (content sections)
- Large spacing: mb-16, mt-20 (section breaks)

**Container Strategy**:
- Max-width: max-w-7xl for full layouts
- Content areas: max-w-4xl for forms and text-heavy sections
- Dashboards: Full-width with inner padding

## Component Library

### Navigation
**Main Header**:
- Fixed top navigation (sticky top-0)
- Logo left, primary navigation center, user menu + "Become a Provider" CTA right
- Height: h-16 with backdrop blur effect
- Mobile: Hamburger menu revealing slide-in navigation

### Homepage Hero
**Layout**: Full-width section with professional healthcare imagery
- Large headline: "Find Expert Healthcare at Home"
- Subheadline explaining the service value
- Prominent search bar: Location + Service Type + Search button
- Quick service category pills below search (Physiotherapy, Home Nursing, Doctor Consultation)
- Background: Professional healthcare professional image with gradient overlay for text readability
- Buttons on images: Implement with backdrop-blur-sm and semi-transparent backgrounds

### Provider Cards
**Grid Layout**: 3-column on desktop (grid-cols-3), 2 on tablet, 1 on mobile
- Provider photo: aspect-square, rounded-lg
- Name + credentials badge
- Specialization tags
- Star rating with review count
- Starting price
- "Next Available" indicator with date/time
- Location with distance
- "Book Now" button

### Provider Profile Page
**Layout**: 2-column split (60/40)
- Left: Profile header (photo, name, credentials, ratings), About section, Services & Pricing table, Reviews
- Right: Sticky booking widget with calendar and time slot selection
- Service cards: Icon + title + description + price per session

### Booking Flow
**Calendar Interface**:
- Month view with available dates highlighted
- Time slot grid below (morning/afternoon/evening sections)
- Visit type selector: "In-Clinic" vs "Home Visit" toggle
- Appointment summary card (sticky on scroll)
- Multi-step progress indicator at top

### Dashboards

**Provider Dashboard**:
- Top stats cards row: Today's Appointments, Week Revenue, Average Rating, Total Patients
- Main area: Upcoming appointments list with patient details, time, service type
- Right sidebar: Weekly calendar overview, Availability quick-edit

**Patient Dashboard**:
- Hero card: Next upcoming appointment with provider details, countdown timer, action buttons
- Tabs: Upcoming (3 column cards), History (list view), Invoices (table)
- Quick actions: "Book New Appointment" prominent CTA

### Forms & Inputs
- Input fields: h-12, rounded-lg, with floating labels
- Dropdowns: Custom styled with chevron icons
- Date/time pickers: Inline calendar widgets
- Textareas: min-h-32 for notes/descriptions
- Error states: Red accent with inline validation messages

### Search & Filters
**Filter Sidebar** (left, w-64):
- Service type checkboxes
- Location radius slider
- Availability date picker
- Price range slider
- Rating filter
- "Apply Filters" sticky button at bottom

### Communication Components
**In-App Chat**:
- Fixed bottom-right chat bubble icon
- Slide-up chat panel with conversation history
- Message bubbles with timestamps
- File attachment support for medical documents

### Payment Elements
**Checkout Flow**:
- Appointment summary card (provider, service, date/time)
- Stripe payment element embedded
- Secure payment badge
- Cancellation policy disclosure

## Images Strategy

**Where to Use Images**:
1. **Homepage Hero**: Large professional photo of healthcare provider with patient (warm, trustworthy)
2. **Provider Profiles**: High-quality headshots (aspect-square, minimum 400x400px)
3. **Service Category Cards**: Icon-based illustrations for Physiotherapy, Nursing, Doctor services
4. **Testimonial Section**: Patient photos alongside reviews (circular, small)
5. **About/How It Works Section**: Illustrations showing booking flow steps

**No Images Needed**:
- Dashboards (data-focused)
- Forms and booking flows
- Admin panels

## Animations
Minimal, purposeful animations only:
- Smooth calendar date selection (scale transition)
- Hover states on provider cards (subtle lift: hover:shadow-lg transition-shadow)
- Loading states for booking confirmations (spinner)
- No scroll-triggered animations

## Key UI Patterns
- **Status Badges**: Rounded pills for appointment status (Confirmed, Pending, Completed, Cancelled)
- **Rating Display**: Gold stars with numerical rating and count
- **Availability Indicators**: Green dot for "Available Today", calendar icon for "Book Ahead"
- **Service Tags**: Small rounded badges with icons
- **CTA Hierarchy**: Primary action buttons prominent, secondary actions as text links

This design creates a professional, trustworthy healthcare platform that balances medical credibility with modern booking convenience.