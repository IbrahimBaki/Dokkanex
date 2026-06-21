import { adminSupabase } from './adminSupabase'

export async function listAllUsers() {
  const { data, error } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users
}

export async function banUser(userId) {
  const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
    ban_duration: '876000h'
  })
  if (error) throw error
}

export async function unbanUser(userId) {
  const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
    ban_duration: 'none'
  })
  if (error) throw error
}

export async function listAllProducts() {
  const { data, error } = await adminSupabase
    .from('products')
    .select('id, name, category_id, user_id, selling_price, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data
}

export async function getSystemStats() {
  const { data: usersData, error: usersError } = await adminSupabase.auth.admin.listUsers({
    page: 1, perPage: 1000
  })
  if (usersError) throw usersError

  const { count: productCount, error: prodError } = await adminSupabase
    .from('products')
    .select('id', { count: 'exact', head: true })
  if (prodError) throw prodError

  const { count: categoryCount, error: catError } = await adminSupabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
  if (catError) throw catError

  const users = usersData.users
  const activeUsers = users.filter(u => !u.banned_until || new Date(u.banned_until) < new Date()).length

  return {
    totalUsers: users.length,
    activeUsers,
    deactivatedUsers: users.length - activeUsers,
    totalProducts: productCount,
    totalCategories: categoryCount
  }
}
