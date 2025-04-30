// server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// CORS 설정: 클라이언트에서 API에 접근할 수 있도록 함.
app.use(cors());
app.use(express.json());

// MongoDB 연결 (로컬 DB 사용 시)
// MongoDB가 로컬에 설치되어 있다면 아래 URI를 사용하고,
// 만약 MongoDB Atlas 클러스터를 사용한다면 Atlas 연결 URI를 입력하세요.
const mongoURI = 'mongodb://localhost:27017/quizDB';

// MongoDB 연결
mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✔ MongoDB 연결 성공'))
  .catch((err) => console.error('✖ MongoDB 연결 실패:', err));

// 몽고DB 스키마 정의 (문제 게시판 데이터 구조 예시)
const quizSchema = new mongoose.Schema({
  category: { type: String, required: true },
  question: { type: String, required: true },
  options: { type: [String], required: true },
  correctAnswer: { type: String, required: true },
});

// 컬렉션 이름을 'questions'로 지정 (이미 해당 컬렉션이 존재하면 자동 사용)
const Quiz = mongoose.model('Quiz', quizSchema, 'questions');

// API 엔드포인트: 모든 퀴즈 문제를 불러오는 GET API
app.get('/api/questions', async (req, res) => {
  try {
    const questions = await Quiz.find();
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/categories', async (req, res) => {
    try {
      // questions 컬렉션(Quiz 모델)에서 'category' 필드에 대해 중복 없이 고유한 값만 가져옵니다.
      const categories = await Quiz.distinct('category');
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });  

// 간단한 테스트 API
app.get('/', (req, res) => {
  res.send('퀴즈 백엔드 서버가 실행 중입니다!');
});

app.listen(port, () => {
  console.log(`✔ 서버가 포트 ${port}에서 실행 중입니다.`);
});
