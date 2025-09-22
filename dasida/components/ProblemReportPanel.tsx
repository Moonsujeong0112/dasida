import { StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';

type Props = {
  page?: string;
  number?: string;
  onClose?: () => void;
};

export function ProblemReportPanel({ page, number, onClose }: Props) {
  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.headerRow}>
        <ThemedView style={styles.pill}>
          <ThemedText style={styles.pillText}>문제 리포트</ThemedText>
        </ThemedView>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <IconSymbol name="xmark" size={18} color={'#333'} />
        </TouchableOpacity>
      </ThemedView>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        <ThemedView style={styles.outlineCard}>
          <ThemedView style={styles.sectionBlock}>
            <ThemedText style={styles.sectionTitle}>바로잡기</ThemedText>
            <ThemedText style={styles.bullet}>• 핵심 개념: 방정식의 전개와 이항법칙</ThemedText>
            <ThemedText style={styles.bullet}>• 오류 유형: 단순 연산 실수(덧/뺄셈 잘못 처리)</ThemedText>
          </ThemedView>

          <ThemedView style={styles.separator} />

          <ThemedView style={styles.sectionBlock}>
            <ThemedText style={styles.sectionTitle}>풀이 돌아보기</ThemedText>
            <ThemedText style={styles.step}>방정식 세움: x + (x − 3) = 31 ⇒ 2x − 3 = 31</ThemedText>
            <ThemedText style={styles.step}>이때 −3을 이항하는 과정에서 덧셈/뺄셈 실수 발생</ThemedText>
            <ThemedText style={styles.step}>정확: 2x = 34 → x = 17 / 오답: 2x = 28</ThemedText>
          </ThemedView>

          <ThemedView style={styles.callout}>
            <ThemedText style={styles.calloutTitle}>다시다 한 스푼</ThemedText>
            <ThemedText style={styles.calloutText}>“방정식 풀 때 이항 과정을 천천히 점검하면 계산 실수를 줄일 수 있어요.”</ThemedText>
          </ThemedView>

          <ThemedView style={styles.sectionBlock}>
            <ThemedText style={styles.sectionTitle}>해결 팁</ThemedText>
            <ThemedText style={styles.bullet}>• 계산 전 과정 기록: 암산보다 한 줄씩 써 내려가기</ThemedText>
            <ThemedText style={styles.bullet}>• 이항 체크: 부호(+/−) 바뀌는지 꼭 확인</ThemedText>
            <ThemedText style={styles.bullet}>• 대입 검산: 최종 답을 조건(합=31, 차=3)으로 확인</ThemedText>
            <ThemedText style={styles.bullet}>• 습관화: 끝나면 “합/차 맞는지” 자동 점검하기</ThemedText>
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  pill: {
    backgroundColor: '#2F66FF',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  pillText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  closeBtn: {
    padding: 8,
  },
  scroll: {
    paddingHorizontal: 12,
  },
  outlineCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#3B6BFF',
    padding: 16,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  separator: {
    height: 1,
    backgroundColor: '#E7EDFF',
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  bullet: {
    fontSize: 13,
    lineHeight: 18,
    color: '#333',
    marginBottom: 6,
  },
  step: {
    fontSize: 13,
    lineHeight: 18,
    color: '#333',
    marginBottom: 4,
  },
  callout: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE0A3',
    padding: 14,
    marginBottom: 12,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  calloutText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#333',
  },
});

export default ProblemReportPanel;


