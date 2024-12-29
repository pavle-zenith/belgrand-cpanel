document.addEventListener('DOMContentLoaded', () => {
    const createDisplayForm = document.getElementById('createDisplayForm');
    const displayList = document.getElementById('displayList');
    const createUserForm = document.getElementById('createUserForm');
    const userList = document.getElementById('userList');
    const displaySelect = document.getElementById('displaySelect');
    const streamLinks = document.getElementById('streamLinks');
  
    // Dummy data for demo
    const displays = [];
    const users = [];
  
    // Create Display
    createDisplayForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(createDisplayForm);
      const display = {
        name: formData.get('name'),
        location: formData.get('location'),
        resolution: formData.get('resolution'),
      };
      displays.push(display);
      updateDisplayList();
      updateDisplaySelect();
      createDisplayForm.reset();
    });
  
    // Create User
    createUserForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(createUserForm);
      const selectedDisplays = Array.from(displaySelect.selectedOptions).map(
        (option) => option.value
      );
      const user = {
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password'),
        displays: selectedDisplays,
      };
      users.push(user);
      updateUserList();
      createUserForm.reset();
    });
  
    // Update Display List
    function updateDisplayList() {
      displayList.innerHTML = displays
        .map((d, index) => `<li>${d.name} - ${d.location} (${d.resolution})</li>`)
        .join('');
    }
  
    // Update Display Select Options
    function updateDisplaySelect() {
      displaySelect.innerHTML = displays
        .map((d, index) => `<option value="${index}">${d.name}</option>`)
        .join('');
    }
  
    // Update User List
    function updateUserList() {
      userList.innerHTML = users
        .map((u, index) => `<li data-index="${index}">${u.name}</li>`)
        .join('');
  
      // Add click event to show stream links
      document.querySelectorAll('#userList li').forEach((item) => {
        item.addEventListener('click', (e) => {
          const userIndex = e.target.getAttribute('data-index');
          const user = users[userIndex];
          showStreamLinks(user);
        });
      });
    }
  
    // Show Stream Links
    function showStreamLinks(user) {
      const userDisplays = user.displays.map(
        (dIndex) => displays[dIndex]
      );
      streamLinks.innerHTML = `
        <h3>${user.name}'s Displays</h3>
        <ul>
          ${userDisplays
            .map((d) => `<li>${d.name} - ${d.location}</li>`)
            .join('')}
        </ul>
      `;
    }
  });
  