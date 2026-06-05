export default function CategoryFilter({ categories, selected, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      <button
        onClick={() => onChange(null)}
        className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
          selected === null
            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
            : 'bg-white text-slate-600 border border-slate-300 hover:border-indigo-300 hover:text-indigo-600'
        }`}
      >
        الكل
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.id)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            selected === cat.id
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
              : 'bg-white text-slate-600 border border-slate-300 hover:border-indigo-300 hover:text-indigo-600'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
