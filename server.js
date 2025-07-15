// server.js - 라우트 순서 개선
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// CORS 설정
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: false
}));

app.options('*', cors());
app.use(express.json());

// MongoDB 연결
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/quizDB';

mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✔ MongoDB 연결 성공'))
  .catch((err) => console.error('✖ MongoDB 연결 실패:', err));

// 스키마 정의
const quizSchema = new mongoose.Schema({
  category: { type: String, required: true },
  question: { type: String, required: true },
  options: { type: [String], required: true },
  answer: { type: Number, required: true },
});

const wrongAnswerSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  category: { type: String, required: true },
  question: { type: String, required: true },
  correctAnswer: { type: String, required: true },
  userAnswer: { type: String, required: true },
  correctIndex: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Quiz = mongoose.model('Quiz', quizSchema, 'questions');
const WrongAnswer = mongoose.model('WrongAnswer', wrongAnswerSchema, 'wrongAnswers');

// 간단한 테스트 API (맨 위로)
app.get('/', (req, res) => {
  res.send('퀴즈 백엔드 서버가 실행 중입니다!');
});

// 기본 API들
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Quiz.distinct('category');
    res.json(categories);
  } catch (error) {
    console.error('카테고리 조회 실패:', error);
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/questions', async (req, res) => {
  try {
    const questions = await Quiz.find();
    res.json(questions);
  } catch (error) {
    console.error('문제 조회 실패:', error);
    res.status(500).json({ message: error.message });
  }
});

// 문제 텍스트로 원본 문제 조회 (쿼리 파라미터 사용)
app.get('/api/question-by-text', async (req, res) => {
  try {
    const { question } = req.query;
    
    if (!question) {
      return res.status(400).json({ message: 'question parameter is required' });
    }
    
    const quiz = await Quiz.findOne({ question: question });
    
    if (quiz) {
      res.json({
        question: quiz.question,
        options: quiz.options,
        answer: quiz.answer
      });
    } else {
      res.status(404).json({ message: '문제를 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('문제 조회 실패:', error);
    res.status(500).json({ message: error.message });
  }
});

const solvedQuestionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  questionId: { type: String, required: true }, // Quiz 컬렉션의 _id
  category: { type: String, required: true },
  isCorrect: { type: Boolean, required: true },
  solvedAt: { type: Date, default: Date.now },
  timeSpent: { type: Number }, // 문제 풀이에 걸린 시간(초)
});

// 복합 인덱스로 중복 방지 및 성능 최적화
solvedQuestionSchema.index({ userId: 1, questionId: 1 }, { unique: true });
solvedQuestionSchema.index({ userId: 1, category: 1 });

const SolvedQuestion = mongoose.model('SolvedQuestion', solvedQuestionSchema, 'solvedQuestions');

// 문제 풀이 기록 저장
app.post('/api/solved-questions/save', async (req, res) => {
  try {
    const { userId, questionId, category, isCorrect, timeSpent } = req.body;
    
    // 기존 기록이 있으면 업데이트, 없으면 생성
    const result = await SolvedQuestion.findOneAndUpdate(
      { userId, questionId },
      { 
        category, 
        isCorrect, 
        timeSpent,
        solvedAt: new Date()
      },
      { 
        upsert: true, 
        new: true 
      }
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('문제 풀이 기록 저장 실패:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 도전하기용 - 안 푼 문제들만 조회
app.get('/api/questions/unsolved/:userId/:category', async (req, res) => {
  try {
    const { userId, category } = req.params;
    const { limit = 10 } = req.query;
    
    // 해당 사용자가 이미 푼 문제 ID들 조회
    const solvedQuestions = await SolvedQuestion.find(
      { userId, category },
      { questionId: 1 }
    );
    const solvedQuestionIds = solvedQuestions.map(sq => sq.questionId);
    
    // 안 푼 문제들만 조회
    const unsolvedQuestions = await Quiz.find({
      category,
      _id: { $nin: solvedQuestionIds }
    });
    
    // 문제가 부족하면 기존 문제도 포함 (선택사항)
    let finalQuestions = unsolvedQuestions;
    if (unsolvedQuestions.length < limit) {
      const additionalQuestions = await Quiz.find({ category })
        .limit(limit - unsolvedQuestions.length);
      finalQuestions = [...unsolvedQuestions, ...additionalQuestions];
    }
    
    // 랜덤 섞기 후 제한
    const shuffled = finalQuestions
      .sort(() => 0.5 - Math.random())
      .slice(0, limit);
    
    res.json(shuffled);
  } catch (error) {
    console.error('미해결 문제 조회 실패:', error);
    res.status(500).json({ message: error.message });
  }
});

// 사용자 통계 조회
app.get('/api/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const stats = await SolvedQuestion.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$category',
          totalSolved: { $sum: 1 },
          correctCount: { 
            $sum: { $cond: ['$isCorrect', 1, 0] } 
          },
          avgTime: { $avg: '$timeSpent' }
        }
      }
    ]);
    
    res.json(stats);
  } catch (error) {
    console.error('통계 조회 실패:', error);
    res.status(500).json({ message: error.message });
  }
});

// 오답 저장
app.post('/api/wrong-answers/save', async (req, res) => {
  try {
    const { userId, category, question, correctAnswer, userAnswer, correctIndex } = req.body;
    
    if (!userId || !category || !question || !correctAnswer || !userAnswer || correctIndex === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Required fields missing' 
      });
    }
    
    console.log('오답 저장 요청 받음:', {
      userId,
      category,
      question: question.substring(0, 50) + '...',
      correctAnswer,
      userAnswer,
      correctIndex
    });
    
    // 중복 체크
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
    
    res.json({ 
      success: true, 
      message: '오답이 저장되었습니다.', 
      id: savedAnswer._id 
    });
  } catch (error) {
    console.error('오답 저장 실패:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 오답노트 카테고리 목록 조회 (라우트 순서 중요!)
app.get('/api/wrong-answers/categories/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    
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
    
    if (!userId || !category) {
      return res.status(400).json({ message: 'userId and category are required' });
    }
    
    const wrongAnswers = await WrongAnswer.find({ userId, category });
    res.json(wrongAnswers);
  } catch (error) {
    console.error('오답 문제 조회 실패:', error);
    res.status(500).json({ message: error.message });
  }
});

// 오답 삭제
app.delete('/api/wrong-answers/:wrongAnswerId', async (req, res) => {
  try {
    const { wrongAnswerId } = req.params;
    
    if (!wrongAnswerId) {
      return res.status(400).json({ 
        success: false, 
        message: 'wrongAnswerId is required' 
      });
    }
    
    const result = await WrongAnswer.findByIdAndDelete(wrongAnswerId);
    
    if (result) {
      res.json({ 
        success: true, 
        message: '오답이 삭제되었습니다.' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        message: '삭제할 오답을 찾을 수 없습니다.' 
      });
    }
  } catch (error) {
    console.error('오답 삭제 실패:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 사용자 계정 삭제 API
app.delete('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 해당 사용자의 모든 오답 삭제
    await WrongAnswer.deleteMany({ userId });
    
    res.json({ success: true, message: '사용자 데이터가 삭제되었습니다.' });
  } catch (error) {
    console.error('사용자 삭제 실패:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 404 핸들러
app.use('*', (req, res) => {
  res.status(404).json({ message: '요청한 경로를 찾을 수 없습니다.' });
});

// 에러 핸들러
app.use((error, req, res, next) => {
  console.error('서버 에러:', error);
  res.status(500).json({ message: '서버 내부 오류가 발생했습니다.' });
});

// 서버 시작
app.listen(port, '0.0.0.0', () => {
  console.log(`✔ 서버가 포트 ${port}에서 실행 중입니다.`);
});
