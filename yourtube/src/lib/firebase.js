import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBPfd1bdxcNppnpI30f4pyFzzYzXf3375A",
  authDomain: "yourtube-ee646.firebaseapp.com",
  projectId: "yourtube-ee646",
  storageBucket: "yourtube-ee646.firebasestorage.app",
  messagingSenderId: "500292856855",
  appId: "1:500292856855:web:da72adbbb7797af82c0052",
  measurementId: "G-Z3KLRHLX2R",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

provider.setCustomParameters({
  prompt: "select_account",
});

export { auth, provider };