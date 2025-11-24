Step-by-Step Mobile-First UX/UI Implementation
For Manager & Tenant Portals - Nate Gadgets Property Management System
CONTEXT & REQUIREMENTS
Current State
Manager Portal: Dashboard with analytics, properties, tenants, payments, expenses, maintenance

Tenant Portal: Welcome screen, rent info, payment status, lease details

Both have top navigation (hamburger menu on mobile)

MISSING: Professional bottom navigation for mobile view

Target
Create an elegant, professional bottom navigation bar that:

Works seamlessly on mobile (iPhone, Android)

Follows modern mobile UX patterns (iOS & Material Design)

Improves navigation accessibility

Maintains brand consistency

Supports both Manager & Tenant role-based navigation

Includes smooth animations and transitions

Shows active state clearly

Handles different screen sizes (mobile, tablet, desktop)

Is accessible (keyboard navigation, ARIA labels)

Integrates with existing design system

PHASE 1: Design Specifications & Component Architecture
Task 1.1: Define Bottom Navigation Structure
What Codex Should Do:

Analyze the two portals (manager and tenant)

Define the navigation items for EACH portal

Create a component architecture

Document design tokens and styling approach

Manager Portal Navigation Items:

Dashboard (home icon) - Analytics, overview

Properties (building icon) - Property management

Tenants (people icon) - Tenant management

Payments (wallet icon) - Payment management

More (three dots) - Additional options (Water Bills, Expenses, Maintenance, Messages, Notices, Reports)

Tenant Portal Navigation Items:

Home (home icon) - Welcome/dashboard

Rent (dollar icon) - Rent information & payment

Lease (document icon) - Lease details

Profile (user icon) - Tenant profile/settings

More (three dots) - Additional options (Messages, Notices)

Requirements for Codex:

text
1. Create a BottomNavBar component that:
   - Accepts role prop: 'manager' | 'tenant'
   - Renders different navigation items based on role
   - Shows 4-5 main items + "More" for overflow

2. Create an individual NavItem component that:
   - Accepts: icon, label, route, isActive, badge (optional)
   - Shows icon + label in mobile view
   - Shows only icon on very small screens (< 320px)
   - Highlights active route

3. Create a MoreMenu component that:
   - Opens as overlay/dropdown
   - Shows additional navigation items
   - Closes on item selection or outside click
   - Appears above bottom nav (not behind)

4. Document the component props and usage

5. Define CSS classes/Tailwind utilities needed
   - nav-item (base style)
   - nav-item--active (active state)
   - nav-item--badge (badge styling)
   - bottom-nav (container)
   - more-menu (dropdown overlay)
Task 1.2: Mobile Breakpoint Strategy
Codex Should Define:

text
Mobile Breakpoints:
- Extra Small (XS): 320px - Phones (iPhone SE, old Android)
- Small (SM): 375px - Modern phones (iPhone 12-14)
- Medium (MD): 425px - Larger phones (iPhone 15 Pro Max)
- Large (LG): 768px - Tablets (iPad Mini)
- Extra Large (XL): 1024px+ - Desktop

Bottom Nav Behavior:
- XS (320px):  Show only icons (no labels), smaller padding
- SM (375px):  Show icons + labels, normal padding
- MD (425px+): Show icons + labels, comfortable padding
- LG (768px+): Convert to top/side nav (don't show bottom nav)
- XL (1024px+): Full desktop layout

CSS Media Queries:
@media (max-width: 479px) { /* XS & SM */ }
@media (max-width: 424px) { /* XS only - icon labels hidden */ }
@media (min-width: 768px) { /* Hide bottom nav on tablet+ */ }

Tailwind Utility:
Use custom breakpoint: sm: 375px, md: 425px (not default sizes)
Task 1.3: Design Tokens & Color System
Codex Should Document:

text
Color Tokens:
- Primary: #2563EB (Blue - from your system)
- Active Background: rgba(37, 99, 235, 0.1) - Light blue
- Inactive Icon: #6B7280 (Gray-500)
- Active Icon: #2563EB (Primary)
- Border: #E5E7EB (Gray-200)
- Background: #FFFFFF (White)
- Overlay (MoreMenu): rgba(0, 0, 0, 0.5) - Dark semi-transparent

Spacing:
- Nav Item Padding: 8px vertical, 4px horizontal (XS) → 12px vertical, 8px horizontal (SM+)
- Nav Bar Height: 56px (XS/SM), 64px (MD), 72px (LG)
- Icon Size: 24px (XS), 28px (SM+)
- Label Font Size: 11px (XS), 12px (SM+)
- Label Font Weight: 500 (medium)
- Letter Spacing: 0.5px

Typography:
- Label Font: System font (San Francisco, Roboto, etc.)
- Label Line Height: 1.2
- All uppercase or title case (consistent with existing)

Shadows:
- Bottom Nav: 0 -2px 8px rgba(0, 0, 0, 0.08)
- MoreMenu: 0 -4px 12px rgba(0, 0, 0, 0.12)

Animations:
- Icon transition: 200ms ease-out
- Label opacity: 150ms ease-out
- MoreMenu slide-up: 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)
- Badge pulse (optional): 2s infinite
- Ripple effect on tap: 400ms
PHASE 2: Component Implementation
Task 2.1: Create BottomNavBar Component (Base)
Codex Should Create:

typescript
// BottomNavBar Component Structure

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  route: string;
  badge?: number;
  ariaLabel: string;
}

interface BottomNavBarProps {
  role: 'manager' | 'tenant';
  currentRoute: string;
  onNavigate: (route: string) => void;
  showMoreMenu?: boolean;
}

// Manager Routes
const MANAGER_NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <DashboardIcon />,
    route: '/dashboard',
    ariaLabel: 'Dashboard - View analytics and overview'
  },
  {
    id: 'properties',
    label: 'Properties',
    icon: <BuildingIcon />,
    route: '/properties',
    ariaLabel: 'Properties - Manage your properties'
  },
  {
    id: 'tenants',
    label: 'Tenants',
    icon: <PeopleIcon />,
    route: '/tenants',
    ariaLabel: 'Tenants - Manage tenant information'
  },
  {
    id: 'payments',
    label: 'Payments',
    icon: <WalletIcon />,
    route: '/payments',
    badge: 0, // Dynamic badge for pending payments
    ariaLabel: 'Payments - View and manage payments'
  },
  {
    id: 'more',
    label: 'More',
    icon: <MoreIcon />,
    route: '#more',
    ariaLabel: 'More options - Water bills, expenses, maintenance'
  }
];

// Tenant Routes
const TENANT_NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: <HomeIcon />,
    route: '/tenant/dashboard',
    ariaLabel: 'Home - Welcome and overview'
  },
  {
    id: 'rent',
    label: 'Rent',
    icon: <DollarIcon />,
    route: '/tenant/rent',
    badge: 0, // Dynamic: 1 if payment due, 0 if paid up
    ariaLabel: 'Rent - View rent status and payment'
  },
  {
    id: 'lease',
    label: 'Lease',
    icon: <DocumentIcon />,
    route: '/tenant/lease',
    ariaLabel: 'Lease - View lease details and documents'
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: <UserIcon />,
    route: '/tenant/profile',
    ariaLabel: 'Profile - View and edit your profile'
  },
  {
    id: 'more',
    label: 'More',
    icon: <MoreIcon />,
    route: '#more',
    ariaLabel: 'More options - Messages, notices'
  }
];

// Component pseudocode:
export const BottomNavBar = ({
  role,
  currentRoute,
  onNavigate,
  showMoreMenu
}: BottomNavBarProps) => {
  const navItems = role === 'manager' ? MANAGER_NAV_ITEMS : TENANT_NAV_ITEMS;
  
  return (
    <div className="bottom-nav-container">
      <nav className="bottom-nav" role="navigation" aria-label="Mobile navigation">
        {navItems.map(item => (
          <NavItem
            key={item.id}
            {...item}
            isActive={currentRoute.startsWith(item.route)}
            onClick={() => onNavigate(item.route)}
          />
        ))}
      </nav>
      {showMoreMenu && <MoreMenu role={role} onNavigate={onNavigate} />}
    </div>
  );
};
Requirements for Codex:

Use TypeScript with proper type definitions

Accept all nav items as configuration (no hard-coding)

Support dynamic badges (for payment counts, etc.)

Implement role-based routing

Export types for integration

Add detailed JSDoc comments

Support both React Router and Next.js routing

Include accessibility attributes (aria-label, role, etc.)

Task 2.2: Create NavItem Component
Codex Should Create:

typescript
// NavItem Component

interface NavItemProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  route: string;
  isActive: boolean;
  onClick: () => void;
  badge?: number;
  ariaLabel: string;
  showLabel?: boolean; // Hide on XS screens
}

// Component logic:
export const NavItem = ({
  id,
  label,
  icon,
  isActive,
  onClick,
  badge,
  ariaLabel,
  showLabel = true
}: NavItemProps) => {
  return (
    <button
      className={cn(
        'nav-item',
        isActive && 'nav-item--active',
        badge && badge > 0 && 'nav-item--has-badge'
      )}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={isActive ? 'page' : undefined}
      type="button"
    >
      <div className="nav-item__icon-wrapper">
        {icon}
        {badge && badge > 0 && (
          <span className="nav-item__badge" aria-label={`${badge} items`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      {showLabel && <span className="nav-item__label">{label}</span>}
    </button>
  );
};
Requirements for Codex:

text
1. Styling:
   - Flexbox column layout (icon over label)
   - Center alignment
   - Smooth transitions on hover/active
   - Ripple effect on tap (Material Design)
   - Active state: colored icon + underline accent

2. Badge:
   - Position: top-right of icon
   - Background: red/error color
   - Size: 20px diameter
   - Shows count (max 99+)
   - Pulses gently (optional animation)

3. Responsive:
   - XS (< 425px): Icon only, 24px size, no label
   - SM (≥ 425px): Icon + label, 28px icon size

4. States:
   - Default: gray icon, gray label
   - Active: blue icon, blue label, underline accent (4px)
   - Hover: slight background tint
   - Pressed: ripple effect + icon scale 0.95

5. Accessibility:
   - Keyboard focusable (tab order)
   - Focus indicator (outline or glow)
   - aria-current for active item
   - aria-label for each item
   - Touch target minimum 44x44px (but pad if needed)
Task 2.3: Create MoreMenu Component
Codex Should Create:

typescript
// MoreMenu Component - Overlay dropdown

interface MoreMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  route: string;
  badge?: number;
}

interface MoreMenuProps {
  role: 'manager' | 'tenant';
  onNavigate: (route: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

// Manager More Items
const MANAGER_MORE_ITEMS: MoreMenuItem[] = [
  { id: 'water-bills', label: 'Water Bills', icon: <DropletIcon />, route: '/water-bills' },
  { id: 'expenses', label: 'Expenses', icon: <TrendingDownIcon />, route: '/expenses' },
  { id: 'maintenance', label: 'Maintenance', icon: <ToolsIcon />, route: '/maintenance', badge: 0 },
  { id: 'messages', label: 'Messages', icon: <MessageIcon />, route: '/messages', badge: 0 },
  { id: 'notices', label: 'Notices', icon: <BellIcon />, route: '/notices', badge: 0 },
  { id: 'reports', label: 'Reports', icon: <BarChartIcon />, route: '/reports' },
  { id: 'statements', label: 'Statements', icon: <FileIcon />, route: '/statements' },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon />, route: '/settings' }
];

// Tenant More Items
const TENANT_MORE_ITEMS: MoreMenuItem[] = [
  { id: 'messages', label: 'Messages', icon: <MessageIcon />, route: '/tenant/messages', badge: 0 },
  { id: 'notices', label: 'Notices', icon: <BellIcon />, route: '/tenant/notices', badge: 0 },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon />, route: '/tenant/settings' }
];

// Component pseudocode:
export const MoreMenu = ({
  role,
  onNavigate,
  onClose,
  isOpen
}: MoreMenuProps) => {
  const items = role === 'manager' ? MANAGER_MORE_ITEMS : TENANT_MORE_ITEMS;

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay backdrop */}
      <div
        className="more-menu__overlay"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Menu container */}
      <div
        className="more-menu"
        role="menu"
        aria-label="Additional navigation options"
      >
        {/* Header */}
        <div className="more-menu__header">
          <h2 className="more-menu__title">More Options</h2>
          <button
            className="more-menu__close"
            onClick={onClose}
            aria-label="Close menu"
            type="button"
          >
            × {/* or use Icon */}
          </button>
        </div>

        {/* Menu items grid (2 or 3 columns) */}
        <div className="more-menu__grid">
          {items.map(item => (
            <button
              key={item.id}
              className="more-menu__item"
              onClick={() => {
                onNavigate(item.route);
                onClose();
              }}
              role="menuitem"
              type="button"
            >
              <div className="more-menu__item-icon">
                {item.icon}
                {item.badge && item.badge > 0 && (
                  <span className="more-menu__badge">{item.badge > 99 ? '99+' : item.badge}</span>
                )}
              </div>
              <span className="more-menu__item-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
Requirements for Codex:

text
1. Layout:
   - Full-screen overlay with semi-transparent backdrop
   - Menu slides up from bottom (animation)
   - Grid layout: 2 columns (XS), 3 columns (SM+)
   - Max height: 80% of viewport (allow scroll if needed)

2. Styling:
   - White background, rounded top corners (24px)
   - Header with title + close button
   - Grid items with icon + label (vertical layout)
   - Item spacing: 16px gaps
   - Item hover: background tint + scale 1.05

3. Animations:
   - Backdrop fade-in: 150ms
   - Menu slide-up: 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)
   - Close (reverse): 250ms
   - Item tap: ripple effect + slight scale

4. Accessibility:
   - Focus trap (first/last items cycle)
   - Escape key closes menu
   - aria-hidden on overlay
   - role="menu" and role="menuitem"
   - aria-label for close button

5. Behavior:
   - Opens on "More" nav item click
   - Closes on item selection (navigate + close)
   - Closes on backdrop click
   - Closes on Escape key
   - Never locks behind scroll (fixed/modal)
Task 2.4: Create Styling Module (Tailwind/CSS)
Codex Should Create:

css
/* bottom-nav.module.css or tailwind.config.js extension */

/* Container */
.bottom-nav-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 40;
  display: none; /* Show only on mobile */
}

@media (max-width: 767px) {
  .bottom-nav-container {
    display: block;
  }
}

/* Bottom Nav Bar */
.bottom-nav {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 56px; /* XS */
  background: white;
  border-top: 1px solid #E5E7EB;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
  padding-bottom: max(0px, env(safe-area-inset-bottom)); /* Handle notch */
}

@media (min-width: 375px) {
  .bottom-nav {
    height: 64px; /* SM+ */
  }
}

/* Nav Item */
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px; /* XS */
  flex: 1;
  position: relative;
  cursor: pointer;
  border: none;
  background: none;
  transition: all 200ms ease-out;
  border-bottom: 4px solid transparent;
  border-radius: 4px 4px 0 0;
}

@media (min-width: 375px) {
  .nav-item {
    padding: 12px 8px; /* SM+ */
  }
}

/* Nav Item Icon Wrapper */
.nav-item__icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #6B7280; /* Inactive gray */
  transition: color 200ms ease-out;
}

@media (min-width: 375px) {
  .nav-item__icon-wrapper {
    width: 28px;
    height: 28px;
  }
}

/* Nav Item Label */
.nav-item__label {
  font-size: 11px; /* XS */
  font-weight: 500;
  color: #6B7280;
  margin-top: 4px;
  line-height: 1.2;
  letter-spacing: 0.5px;
  display: none; /* Hide on XS */
  transition: color 150ms ease-out;
}

@media (min-width: 375px) {
  .nav-item__label {
    font-size: 12px; /* SM+ */
    display: block; /* Show on SM+ */
  }
}

/* Nav Item Badge */
.nav-item__badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: #EF4444; /* Red error color */
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Nav Item Active State */
.nav-item--active {
  color: #2563EB; /* Primary blue */
  border-bottom-color: #2563EB;
  background: rgba(37, 99, 235, 0.08); /* Light blue background */
}

.nav-item--active .nav-item__icon-wrapper {
  color: #2563EB;
}

.nav-item--active .nav-item__label {
  color: #2563EB;
  font-weight: 600;
}

/* Nav Item Hover State */
.nav-item:hover:not(.nav-item--active) {
  background: rgba(107, 114, 128, 0.08);
}

.nav-item:hover:not(.nav-item--active) .nav-item__icon-wrapper {
  color: #374151;
}

/* Nav Item Focus State (Keyboard) */
.nav-item:focus-visible {
  outline: 2px solid #2563EB;
  outline-offset: 2px;
}

/* Nav Item Active Focus */
.nav-item--active:focus-visible {
  outline: 2px solid #1D4ED8;
  outline-offset: -2px;
}

/* More Menu Overlay */
.more-menu__overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 49;
  animation: fadeIn 150ms ease-out;
}

/* More Menu Container */
.more-menu {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  border-radius: 24px 24px 0 0;
  z-index: 50;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.12);
  animation: slideUp 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

/* More Menu Header */
.more-menu__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #E5E7EB;
}

.more-menu__title {
  font-size: 18px;
  font-weight: 600;
  color: #1F2937;
  margin: 0;
}

.more-menu__close {
  background: none;
  border: none;
  font-size: 24px;
  color: #6B7280;
  cursor: pointer;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 200ms ease-out;
}

.more-menu__close:hover {
  background: rgba(107, 114, 128, 0.1);
  color: #374151;
}

.more-menu__close:focus-visible {
  outline: 2px solid #2563EB;
  outline-offset: 2px;
}

/* More Menu Grid */
.more-menu__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr); /* 2 columns XS */
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

@media (min-width: 375px) {
  .more-menu__grid {
    grid-template-columns: repeat(3, 1fr); /* 3 columns SM+ */
  }
}

/* More Menu Item */
.more-menu__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  cursor: pointer;
  transition: all 200ms ease-out;
  gap: 8px;
  position: relative;
}

.more-menu__item:hover {
  background: #F3F4F6;
  transform: scale(1.05);
  border-color: #2563EB;
}

.more-menu__item:active {
  transform: scale(0.98);
}

.more-menu__item:focus-visible {
  outline: 2px solid #2563EB;
  outline-offset: 2px;
}

/* More Menu Item Icon */
.more-menu__item-icon {
  position: relative;
  font-size: 28px;
  color: #2563EB;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* More Menu Badge */
.more-menu__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #EF4444;
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
}

/* More Menu Item Label */
.more-menu__item-label {
  font-size: 12px;
  font-weight: 500;
  color: #1F2937;
  text-align: center;
  line-height: 1.2;
}

/* Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

/* Badge pulse animation (optional) */
.nav-item__badge {
  animation: pulse 2s infinite;
}

/* Hide bottom nav on tablet+ */
@media (min-width: 768px) {
  .bottom-nav-container {
    display: none;
  }
}
Requirements for Codex:

Provide Tailwind-first version (recommended)

Provide pure CSS module as fallback

Include all responsive breakpoints

Include all animation keyframes

Include safe-area-inset for notch handling

Include z-index layering strategy

Document custom breakpoints needed in tailwind.config.js

Test all states: default, hover, active, focus, disabled

PHASE 3: Integration & State Management
Task 3.1: Integration with Routing
Codex Should Implement:

typescript
// For React Router v6
import { useLocation, useNavigate } from 'react-router-dom';

export const useBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return {
    currentRoute: location.pathname,
    onNavigate: (route: string) => navigate(route),
  };
};

// For Next.js App Router
import { useRouter, usePathname } from 'next/navigation';

export const useBottomNav = () => {
  const router = useRouter();
  const pathname = usePathname();

  return {
    currentRoute: pathname,
    onNavigate: (route: string) => router.push(route),
  };
};

// Usage in Layout
export const RootLayout = ({ children }: { children: React.ReactNode }) => {
  const { currentRoute, onNavigate } = useBottomNav();
  const userRole = useUserRole(); // From auth context
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Show bottom nav only on mobile
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (!isMobile) return <>{children}</>;

  return (
    <div className="pb-16"> {/* Padding bottom for fixed nav */}
      {children}
      <BottomNavBar
        role={userRole}
        currentRoute={currentRoute}
        onNavigate={onNavigate}
        showMoreMenu={showMoreMenu}
      />
    </div>
  );
};
Requirements for Codex:

Support both React Router and Next.js

Create custom hooks for routing

Show bottom nav only on mobile (hide on tablet+)

Add padding-bottom to main content to prevent overlap

Handle deep linking (direct URL navigation)

Sync active state with browser history

Task 3.2: Dynamic Badge Management
Codex Should Implement:

typescript
// Badge Context/State Management

interface BadgeConfig {
  payments: number; // Pending payments
  maintenance: number; // Open maintenance requests
  messages: number; // Unread messages
  notices: number; // New notices
}

// Manager Portal Badge Hook
export const useManagerBadges = () => {
  const [badges, setBadges] = useState<BadgeConfig>({
    payments: 0,
    maintenance: 0,
    messages: 0,
    notices: 0,
  });

  useEffect(() => {
    // Fetch badge counts from API
    const fetchBadges = async () => {
      try {
        const response = await fetch('/api/badges');
        const data = await response.json();
        setBadges(data);
      } catch (error) {
        console.error('Failed to fetch badges:', error);
      }
    };

    fetchBadges();
    const interval = setInterval(fetchBadges, 30000); // Refresh every 30s

    return () => clearInterval(interval);
  }, []);

  return badges;
};

// Tenant Portal Badge Hook
export const useTenantBadges = () => {
  const [badges, setBadges] = useState<BadgeConfig>({
    payments: 0,
    maintenance: 0,
    messages: 0,
    notices: 0,
  });

  useEffect(() => {
    // Fetch badge counts from API
    const fetchBadges = async () => {
      try {
        const response = await fetch('/api/tenant/badges');
        const data = await response.json();
        setBadges(data);
      } catch (error) {
        console.error('Failed to fetch badges:', error);
      }
    };

    fetchBadges();
    const interval = setInterval(fetchBadges, 30000);

    return () => clearInterval(interval);
  }, []);

  return badges;
};

// Usage
export const BottomNavBar = ({ role, ...props }: BottomNavBarProps) => {
  const badges = role === 'manager' ? useManagerBadges() : useTenantBadges();

  return (
    // Pass badges to nav items
    // ...
  );
};
Requirements for Codex:

Create context/hook for badge state

Fetch badge counts from backend API

Real-time updates (WebSocket or polling)

Update interval: 30 seconds

Cache badge data locally

Handle API errors gracefully

Clear intervals on unmount

Task 3.3: MoreMenu State Management
Codex Should Implement:

typescript
// MoreMenu State Hook

export const useMoreMenu = () => {
  const [isOpen, setIsOpen] = useState(false);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen(!isOpen);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return { isOpen, open, close, toggle };
};

// Usage
export const BottomNavBar = ({ role, currentRoute, onNavigate }: BottomNavBarProps) => {
  const { isOpen, open, close, toggle } = useMoreMenu();

  const handleNavClick = (route: string) => {
    if (route === '#more') {
      toggle();
    } else {
      onNavigate(route);
      close();
    }
  };

  return (
    <>
      {/* Nav items with onClick handler */}
      <MoreMenu
        role={role}
        onNavigate={(route) => {
          onNavigate(route);
          close();
        }}
        onClose={close}
        isOpen={isOpen}
      />
    </>
  );
};
Requirements for Codex:

Manage MoreMenu open/close state

Close on Escape key press

Close on item selection

Close on backdrop click

Prevent body scroll when menu open

Restore scroll on close

Handle focus management (optional)

PHASE 4: Mobile-Specific Optimizations
Task 4.1: Safe Area & Notch Handling
Codex Should Implement:

css
/* Handle iPhone notch and safe area insets */

.bottom-nav {
  padding-bottom: max(0px, env(safe-area-inset-bottom));
  /* Fallback for browsers without env() support */
  padding-bottom: max(0px, env(safe-area-inset-bottom, 0px));
}

.more-menu {
  /* Adjust max-height for safe area */
  max-height: calc(80vh - env(safe-area-inset-bottom, 0px));
}

/* Viewport-fit=cover in meta tag (in HTML head) */
/* <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"> */
Requirements for Codex:

Use env(safe-area-inset-bottom) for notch support

Add viewport-fit=cover meta tag

Test on iPhone X, 11, 12, 13, 14, 15 (with notch)

Test on Android devices (no notch)

Document the safe-area handling

Task 4.2: Touch Target & Tap Feedback
Codex Should Implement:

typescript
// Touch feedback component

interface TouchFeedbackProps {
  children: React.ReactNode;
  onPress?: () => void;
}

export const TouchFeedback = ({ children, onPress }: TouchFeedbackProps) => {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <div
      className={cn('touch-feedback', isPressed && 'touch-feedback--active')}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onClick={onPress}
    >
      {children}
    </div>
  );
};

/* CSS */
.touch-feedback {
  transition: transform 100ms ease-out, background-color 100ms ease-out;
}

.touch-feedback--active {
  transform: scale(0.98);
  background-color: rgba(0, 0, 0, 0.05);
}

/* Ensure minimum touch target of 44x44px */
.nav-item {
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
Requirements for Codex:

Minimum touch target: 44x44px

Visual feedback on tap (scale + opacity)

Ripple effect (Material Design style)

Handle both touch and mouse events

No 300ms tap delay (use passive listeners)

Prevent default tap delay on iOS

Task 4.3: Performance Optimization
Codex Should Implement:

typescript
// Performance optimizations

// 1. Memoize components to prevent re-renders
export const BottomNavBar = React.memo(({ role, currentRoute, onNavigate }: BottomNavBarProps) => {
  // Component code
});

export const NavItem = React.memo(({ isActive, onClick, ...props }: NavItemProps) => {
  // Component code
});

// 2. Lazy load MoreMenu
const MoreMenu = React.lazy(() => import('./MoreMenu'));

// 3. Use useCallback for event handlers
const handleNavigate = useCallback((route: string) => {
  onNavigate(route);
}, [onNavigate]);

// 4. Use useTransition for async navigation
const [isPending, startTransition] = useTransition();

const handleNavigation = (route: string) => {
  startTransition(() => {
    navigate(route);
  });
};

// 5. Virtualize long lists in MoreMenu (if > 20 items)
import { FixedSizeList as List } from 'react-window';

// 6. Debounce badge updates
const debouncedFetchBadges = useMemo(
  () => debounce(() => fetchBadges(), 500),
  []
);
Requirements for Codex:

Memoize all components

Use useCallback for handlers

Lazy load MoreMenu

Use useTransition for navigation

Virtualize long lists

Debounce API calls

Minimize re-renders

Optimize bundle size

PHASE 5: Accessibility & Testing
Task 5.1: Accessibility Implementation
Codex Should Implement:

typescript
// WCAG 2.1 AA Compliance

// 1. Keyboard Navigation
export const useKeyboardNavigation = (items: NavItem[]) => {
  const [focusedIndex, setFocusedIndex] = useState(0);

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + items.length) % items.length);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % items.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
    }
  };

  return { focusedIndex, handleKeyDown };
};

// 2. ARIA Labels and Roles
<nav
  role="navigation"
  aria-label="Main navigation"
  aria-orientation="horizontal"
>
  {items.map((item) => (
    <button
      key={item.id}
      role="tab"
      aria-selected={isActive}
      aria-label={item.ariaLabel}
      aria-current={isActive ? 'page' : undefined}
    >
      {/* Content */}
    </button>
  ))}
</nav>

// 3. Focus Management
const navRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (showMoreMenu) {
    // Focus first item in more menu
    navRef.current?.querySelector('button')?.focus();
  }
}, [showMoreMenu]);

// 4. Semantic HTML
<nav> {/* instead of <div> */}
<button> {/* instead of <div onClick> */}
<h2> {/* for titles */}

// 5. Color Contrast
// All colors meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
// Test with: https://webaim.org/resources/contrastchecker/

// 6. Screen Reader Support
<span className="sr-only">3 pending payments</span> {/* For badges */}
Requirements for Codex:

Keyboard navigation (arrow keys, Home, End, Escape)

All interactive elements focusable (tab index)

Focus indicators visible

ARIA labels for all elements

Semantic HTML (nav, button, etc.)

Color contrast ratio ≥ 4.5:1

Screen reader text for badges

Role attributes correct (navigation, menuitem, etc.)

aria-current for active page

Test with: WAVE, Lighthouse, NVDA/JAWS

Task 5.2: Mobile Device Testing
Codex Should Create Testing Checklist:

text
TESTING CHECKLIST FOR BOTTOM NAVIGATION

Device Testing:
[ ] iPhone SE (320px width)
[ ] iPhone 12/13 (375px width)
[ ] iPhone 14/15 Pro Max (430px width)
[ ] Samsung Galaxy S21 (360px width)
[ ] Samsung Galaxy S24 Ultra (440px width)
[ ] iPad Mini (768px - should NOT show bottom nav)
[ ] iPad Pro (1024px - should NOT show bottom nav)

Browser Testing:
[ ] Safari iOS 15+
[ ] Chrome Android 90+
[ ] Firefox Android 90+
[ ] Samsung Internet 16+
[ ] Edge Android

Functionality:
[ ] Navigation items clickable and route correctly
[ ] Active state highlights correctly
[ ] Badges display and update
[ ] "More" menu opens/closes smoothly
[ ] More menu items are clickable
[ ] Close button works
[ ] Overlay backdrop click closes menu
[ ] Escape key closes menu
[ ] No overlap with page content
[ ] Smooth scrolling in more menu if needed

Visual/Styling:
[ ] Icons display correctly
[ ] Labels visible on SM+, hidden on XS
[ ] Spacing looks even and aligned
[ ] Active state colors are correct
[ ] Hover states work
[ ] Focus indicators visible
[ ] No flickering or jumping
[ ] Bottom nav stays at bottom during scroll
[ ] Safe area insets respected (notch)

Performance:
[ ] Loading is smooth (< 200ms)
[ ] Navigation is instant (< 100ms)
[ ] Menu opens/closes smoothly (no jank)
[ ] No layout shifts (CLS < 0.1)
[ ] No excessive re-renders

Accessibility:
[ ] Keyboard navigation works (arrow keys, tab)
[ ] Screen reader announces items
[ ] Focus indicators visible
[ ] High contrast mode works
[ ] Text is readable (12px+ on mobile)
[ ] Touch targets are ≥ 44px

Edge Cases:
[ ] Long property/tenant names don't break layout
[ ] Large badge numbers (99+)
[ ] Many more menu items (scroll works)
[ ] Network error handling
[ ] Slow connection loading
[ ] Logout and role change
[ ] Deep links to nested routes
PHASE 6: Documentation & Delivery
Task 6.1: Component Documentation
Codex Should Create:

typescript
// Storybook stories for visual documentation

import { Meta, StoryObj } from '@storybook/react';
import { BottomNavBar } from './BottomNavBar';

const meta: Meta<typeof BottomNavBar> = {
  title: 'Mobile/BottomNavBar',
  component: BottomNavBar,
  parameters: {
    viewport: {
      defaultViewport: 'mobile1', // Mobile view by default
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Manager Portal Story
export const Manager: Story = {
  args: {
    role: 'manager',
    currentRoute: '/dashboard',
    onNavigate: (route) => console.log('Navigate to:', route),
  },
};

// Tenant Portal Story
export const Tenant: Story = {
  args: {
    role: 'tenant',
    currentRoute: '/tenant/dashboard',
    onNavigate: (route) => console.log('Navigate to:', route),
  },
};

// With badges
export const ManagerWithBadges: Story = {
  args: {
    ...Manager.args,
    // Pass badges to component
  },
};

// More Menu Open
export const MoreMenuOpen: Story = {
  args: {
    ...Manager.args,
    showMoreMenu: true,
  },
};
Requirements for Codex:

Create Storybook stories for each component

Show all states (active, inactive, hover, focus)

Show all device sizes (XS, SM, MD)

Document all props

Include usage examples

Include accessibility checklist

Task 6.2: Implementation Guide
Codex Should Create:

text
# Bottom Navigation Bar - Implementation Guide

## File Structure

src/
├── components/
│ ├── BottomNav/
│ │ ├── BottomNavBar.tsx (main component)
│ │ ├── NavItem.tsx (individual nav item)
│ │ ├── MoreMenu.tsx (more menu overlay)
│ │ ├── useBottomNav.ts (routing hook)
│ │ ├── useMoreMenu.ts (menu state hook)
│ │ ├── useBadges.ts (badge management)
│ │ ├── bottom-nav.module.css (styles)
│ │ ├── bottom-nav.types.ts (TypeScript types)
│ │ └── index.ts (exports)
│ └── Layout/
│ └── RootLayout.tsx (integration point)
├── hooks/
│ ├── useMediaQuery.ts
│ └── useUserRole.ts
└── styles/
└── tailwind.config.js (custom breakpoints)

text

## Integration Steps

1. Copy BottomNav components to src/components/
2. Add custom breakpoints to tailwind.config.js
3. Add viewport meta tag to HTML head
4. Wrap app in RootLayout
5. Test on mobile devices
6. Deploy to production

## API Endpoints Required

- `GET /api/badges` - Fetch manager badge counts
- `GET /api/tenant/badges` - Fetch tenant badge counts

## Environment Variables

None required - uses same backend as main app

## Browser Support

- iOS Safari 13+
- Chrome Android 80+
- Firefox Android 80+
- Samsung Internet 10+
- Edge Android 80+
SUMMARY FOR CODEX
You have been provided with:

Design Specifications - Colors, spacing, typography, animations

Component Architecture - BottomNavBar, NavItem, MoreMenu structure

Implementation Details - TypeScript interfaces, event handling

Styling Guide - Tailwind/CSS for all states and responsive sizes

Integration Patterns - Routing, state management, badge updates

Mobile Optimizations - Notch handling, touch feedback, performance

Accessibility Standards - WCAG 2.1 AA compliance, keyboard navigation

Testing Checklist - Devices, browsers, functionality, accessibility

Documentation - Storybook stories, implementation guide

Your Task:
Implement a professional, elegant bottom navigation bar that:

Works perfectly on mobile (320px - 767px)

Hides automatically on tablet+ (768px+)

Supports both Manager and Tenant portals

Shows dynamic badges

Includes a "More" menu for additional options

Is fully accessible and performant

Follows modern mobile UX patterns

Includes smooth animations

Is ready for production

Deliverables:

All React components (TypeScript)

Complete CSS/Tailwind styles

Custom hooks for routing and state

Integration examples

Storybook documentation

Testing guide

Implementation checklist
