import { OcSharedProjectState } from '../redux/ocSharedProject';
import { useAppSelector } from '../redux/store';

const useOcSharedProject = (): OcSharedProjectState => useAppSelector((s) => s.ocSharedProject);

export default useOcSharedProject;
