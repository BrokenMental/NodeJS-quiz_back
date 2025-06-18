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
const mongoURI = 'mongodb://localhost:27017/quizDB';

// MongoDB 연결
mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✔ MongoDB 연결 성공'))
  .catch((err) => console.error('✖ MongoDB 연결 실패:', err));

// 기존 퀴즈 스키마
const quizSchema = new mongoose.Schema({
  category: { type: String, required: true },
  question: { type: String, required: true },
  options: { type: [String], required: true }, // 4개 선택지 배열
  answer: { type: Number, required: true }, // 정답 인덱스 (0, 1, 2, 3)
});

// 오답노트 스키마 추가
const wrongAnswerSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String, 
    required: true 
  },
  question: { 
    type: String, 
    required: true 
  },
  correctAnswer: { 
    type: String, 
    required: true 
  }, // 정답 텍스트
  userAnswer: { 
    type: String, 
    required: true 
  }, // 사용자가 선택한 답 텍스트
  correctIndex: { 
    type: Number, 
    required: true 
  }, // 정답 인덱스 (오답노트에서 문제 풀 때 사용)
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// 모델 정의
const Quiz = mongoose.model('Quiz', quizSchema, 'questions');
const WrongAnswer = mongoose.model('WrongAnswer', wrongAnswerSchema, 'wrongAnswers');

// 문제 텍스트로 원본 문제 조회 API
app.get('/api/question-by-text', async (req, res) => {
  try {
    const { question } = req.query;
    const quiz = await Quiz.findOne({ question: question });
    
    if (quiz) {
      res.json({
        question: quiz.question,
        options: quiz.options,
        answer: quiz.answer // 정답 인덱스
      });
    } else {
      res.status(404).json({ message: '문제를 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('문제 조회 실패:', error);
    res.status(500).json({ message: error.message });
  }
});

// 기존 API들
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
      const categories = await Quiz.distinct('category');
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
});

// 오답노트 API들 추가
// 오답 저장
// 오답 저장 API에 로깅 추가
app.post('/api/wrong-answers/save', async (req, res) => {
  try {
    const { userId, category, question, correctAnswer, userAnswer, correctIndex } = req.body;
    
    console.log('오답 저장 요청 받음:', {
      userId,
      category,
      question: question.substring(0, 50) + '...',
      correctAnswer,
      userAnswer,
      correctIndex
    });
    
    // 중복 체크 (같은 문제를 여러 번 틀렸을 경우 최신 것만 유지)
    const deletedCount = await WrongAnswer.deleteMany({ userId, question });
    console.log(`기존 동일 문제 ${deletedCount.deletedCount}개 삭제됨`);
    
    const wrongAnswer = new WrongAnswer({
      userId,
      category,
      question,
      correctAnswer,
      userAnswer,
      correctIndex
    });
    
    const savedAnswer = await wrongAnswer.save();
    console.log('오답 저장 완료:', savedAnswer._id);
    
    res.json({ success: true, message: '오답이 저장되었습니다.', id: savedAnswer._id });
  } catch (error) {
    console.error('오답 저장 실패:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 오답노트 카테고리 목록 조회
app.get('/api/wrong-answers/categories/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const categories = await WrongAnswer.distinct('category', { userId });
    res.json(categories);
  } catch (error) {
    console.error('오답 카테고리 조회 실패:', error);
    res.status(500).json({ message: error.message });
  }
});

// 특정 카테고리의 오답 문제들 조회
app.get('/api/wrong-answers/:userId/:category', async (req, res) => {
  try {
    const { userId, category } = req.params;
    const wrongAnswers = await WrongAnswer.find({ userId, category });
    res.json(wrongAnswers);
  } catch (error) {
    console.error('오답 문제 조회 실패:', error);
    res.status(500).json({ message: error.message });
  }
});

// 오답 삭제 (문제를 맞췄을 때)
app.delete('/api/wrong-answers/:wrongAnswerId', async (req, res) => {
  try {
    const { wrongAnswerId } = req.params;
    const result = await WrongAnswer.findByIdAndDelete(wrongAnswerId);
    
    if (result) {
      res.json({ success: true, message: '오답이 삭제되었습니다.' });
    } else {
      res.status(404).json({ success: false, message: '삭제할 오답을 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('오답 삭제 실패:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 간단한 테스트 API
app.get('/', (req, res) => {
  res.send('퀴즈 백엔드 서버가 실행 중입니다!');
});

app.listen(port, () => {
  console.log(`✔ 서버가 포트 ${port}에서 실행 중입니다.`);
});
