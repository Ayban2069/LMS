function showNote(message, isError){
  const note = document.getElementById('note');
  note.textContent = message;
  note.style.color = isError ? '#a3492a' : '';
  note.classList.add('show');
}

// ---------- Student login ----------
async function handleUserLogin(e){
  e.preventDefault();
  const form = e.target;
  const email = form.email.value;
  const password = form.password.value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error){ showNote(error.message, true); return false; }

  window.location.href = 'user/dashboard.html';
  return false;
}

// ---------- Student registration ----------
async function handleUserRegister(e){
  e.preventDefault();
  const form = e.target;
  const password = form.password.value;
  const confirmPassword = form.confirm_password.value;

  if (password !== confirmPassword){
    showNote("Passwords don't match.", true);
    return false;
  }

  const email = form.email.value;

  // Student details travel as signup metadata; the database trigger
  // (auto_register.sql) turns them into the students row automatically.
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        student_id: form.student_id.value,
        full_name: form.full_name.value,
        course: form.course.value
      }
    }
  });
  if (error){ showNote(error.message, true); return false; }

  // With "Confirm email" turned off in Supabase, signUp returns a live session.
  if (data.session){
    showNote('Account created! Redirecting...', false);
    setTimeout(() => { window.location.href = 'user/dashboard.html'; }, 800);
  } else {
    showNote('Account created! You can sign in now.', false);
    showView('user-login');
  }
  return false;
}

// ---------- Admin login ----------
async function handleAdminLogin(e){
  e.preventDefault();
  const form = e.target;
  const email = form.email.value;
  const password = form.password.value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error){ showNote(error.message, true); return false; }

  // Confirm this account actually has an admin profile before granting access
  const { data: adminRow, error: adminError } = await supabaseClient
    .from('admins')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  if (adminError || !adminRow){
    showNote('This account is not registered as an admin.', true);
    await supabaseClient.auth.signOut();
    return false;
  }

  window.location.href = 'admin/dashboard.html';
  return false;
}