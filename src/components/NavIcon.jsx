export default function NavIcon({ name, className = 'h-5 w-5' }) {
  const props = { className, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': true }
  const icon = {
    categories: <><rect x="4" y="4" width="6" height="6" rx="1.25" strokeWidth="1.8" /><rect x="14" y="4" width="6" height="6" rx="1.25" strokeWidth="1.8" /><rect x="4" y="14" width="6" height="6" rx="1.25" strokeWidth="1.8" /><rect x="14" y="14" width="6" height="6" rx="1.25" strokeWidth="1.8" /></>,
    products: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M20 8.25 12 12.8 4 8.25m16 0L12 3.7 4 8.25m16 0v8.2L12 21l-8-4.55v-8.2m8 4.55V21" /></>,
    inventory: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 7.5h16M4 12h16M4 16.5h16" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 5v14m5-14v14m5-14v14" /></>,
    sales: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5 4.5h14v15H5zM8 8h8m-8 3.5h8M8 15h3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m14.5 16 1.5 1.5 3-3" /></>,
    settings: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m19.4 13.6.1-1.6-.1-1.6-2-.6a6.1 6.1 0 0 0-.8-1.4l.5-2-1.4-1.1-1.8 1a6.2 6.2 0 0 0-1.7 0l-1.8-1-1.4 1.1.5 2a6 6 0 0 0-.8 1.4l-2 .6-.1 1.6.1 1.6 2 .6c.2.5.5 1 .8 1.4l-.5 2 1.4 1.1 1.8-1a6.2 6.2 0 0 0 1.7 0l1.8 1 1.4-1.1-.5-2c.3-.4.6-.9.8-1.4l2-.6Z" /></>,
    analytics: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5 19V11m5 8V5m5 14v-6m5 6V8" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3.5 19.5h17" /></>,
  }[name]
  return <svg {...props}>{icon}</svg>
}
