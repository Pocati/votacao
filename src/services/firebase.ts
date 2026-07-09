import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyB8NXytYI0MLOFzi2xIUg28MVBXoKoxELk",
    authDomain: "votacaogreenpark.firebaseapp.com",
    projectId: "votacaogreenpark",
    storageBucket: "votacaogreenpark.firebasestorage.app",
    messagingSenderId: "130115180425",
    appId: "1:130115180425:web:bd8559ed1eb68212e43358",
    measurementId: "G-G7QCWN0HP0"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);