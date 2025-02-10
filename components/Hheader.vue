<script setup lang="ts">
const toast = useToast();
const router = useRouter();
const token = useCookie("authToken").value;
interface UserInfo {
  username: string;
  email: string;
}
const userInfo = ref<UserInfo | null>(null);
let erreur = ref<string | null>(null);
function clear() {
  useCookie("authToken").value = null;
  navigateTo("/");
}
const loggedIn = ref<boolean | null>(null);
try {
  const data = await $fetch("/api/user", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (data) {
    if ("userInfo" in data && data.userInfo != null) {
      loggedIn.value = true;
      userInfo.value = data.userInfo;
    } else if ("error" in data) {
      loggedIn.value = false;
      useCookie("authToken").value = null;
      navigateTo("/")
    }
  }
} catch (err) {
  loggedIn.value = false;
  useCookie("authToken").value = null;
  navigateTo("/")
}
const items = [
  [
    {
      label: "Account",
      slot: "account",
      disabled: true,
    },
  ],
  [
    {
      label: "Home",
      icon: "i-ph-house-duotone",
      click: () => navigateTo("/dashboard/"),
    },
    {
      label: "About",
      icon: "i-ph-info-duotone",
      click: () => navigateTo("/dashboard/servers"),
    },
    {
      label: "Profile",
      icon: "i-ph-user-duotone",
      click: () => navigateTo("/dashboard/profile"),
    },
  ],
  [
    {
      label: "Sign out",
      icon: "i-ph-sign-out",
      click: () => {
        clear();
        toast.add({
          color: "amber",
          title: "Logged out!",
          icon: "i-ph-sign-out",
          description: "user signed out successfully.",
        });
      },
    },
  ],
];
</script>

<template>
  <header class="header">
    <div class="header-content">
      <div class="logo">
        <Logo />
      </div>
      <nav class="header-links">
        <UDropdown v-if="loggedIn" :items="items" mode="hover">
          <UAvatar v-if='userInfo' :src="`https://unavatar.io/gravatar/${userInfo.email}`"
            class="bg-gray-200 dark:bg-neutral-800" />
          <template #account>
            <div class="text-left w-full">
              <p>Signed in as</p>
              <p class="truncate font-medium">
                {{ userInfo?.username }}
              </p>
            </div>
          </template>
        </UDropdown>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.header {
  width: 100%;
  background-color: #4caf50;
  color: white;
  padding: 1rem;
  position: fixed;
  top: 0;
  left: 0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo img {
  height: 40px;
}

.header-links a {
  color: white;
  text-decoration: none;
  font-weight: bold;
}

.header-links a:hover {
  text-decoration: underline;
}
</style>
